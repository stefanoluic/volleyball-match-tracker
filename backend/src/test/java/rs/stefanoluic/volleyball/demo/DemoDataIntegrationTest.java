package rs.stefanoluic.volleyball.demo;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import rs.stefanoluic.volleyball.match.*;
import rs.stefanoluic.volleyball.match.play.MatchPlayService;
import rs.stefanoluic.volleyball.match.play.dto.StartMatchRequest;
import rs.stefanoluic.volleyball.match.play.score.SetScoreService;
import rs.stefanoluic.volleyball.match.play.score.dto.AddPointRequest;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import rs.stefanoluic.volleyball.match.roster.MatchRosterService;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import rs.stefanoluic.volleyball.player.PlayerRepository;
import rs.stefanoluic.volleyball.team.*;
import rs.stefanoluic.volleyball.user.*;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "app.bootstrap-admin.enabled=false", "app.demo.password=TestOnly!Password"})
@ActiveProfiles("demo") @AutoConfigureMockMvc @Testcontainers
class DemoDataIntegrationTest {
    @Container static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }
    @Autowired DemoDataInitializer initializer;
    @Autowired UserRepository users;
    @Autowired TeamRepository teams;
    @Autowired PlayerRepository players;
    @Autowired MatchRepository matches;
    @Autowired MatchPlayerRepository participants;
    @Autowired PasswordEncoder encoder;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired MatchPlayService play;
    @Autowired SetScoreService score;
    @MockitoSpyBean MatchRosterService rosters;

    @BeforeAll static void applicationRunnerSeedsAtStartup(@Autowired UserRepository seededUsers,
                                                          @Autowired MatchRepository seededMatches) {
        assertThat(seededUsers.count()).isEqualTo(3);
        assertThat(seededMatches.count()).isEqualTo(1);
    }
    @BeforeEach void emptyTemporaryDatabase() {
        // This connection belongs exclusively to the disposable Testcontainers database above.
        jdbc.execute("TRUNCATE volleyball.users, volleyball.teams CASCADE");
    }
    private void seed() { initializer.run(new DefaultApplicationArguments()); }

    @Test void createsHashedActiveAccountsAndCompleteScheduledRosters() throws Exception {
        seed();
        assertThat(users.findAll()).hasSize(3).allSatisfy(user -> {
            assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
            assertThat(user.getPasswordHash()).startsWith("$argon2id$").isNotEqualTo("TestOnly!Password");
            assertThat(encoder.matches("TestOnly!Password", user.getPasswordHash())).isTrue();
        });
        assertThat(users.findAll()).extracting(User::getPasswordHash).doesNotHaveDuplicates();
        assertThat(users.findAll()).extracting(User::getRole).containsExactlyInAnyOrder(UserRole.values());
        assertThat(teams.count()).isEqualTo(2);
        assertThat(players.count()).isEqualTo(18);
        assertThat(participants.count()).isEqualTo(18);
        var match = matches.findAll().getFirst();
        assertThat(match.getStatus()).isEqualTo(MatchStatus.SCHEDULED);
        var roster = rosters.get(match.getId());
        for (var side : java.util.List.of(roster.home(), roster.away())) {
            assertThat(side.selected()).hasSize(9).extracting(MatchPlayerResponse::jerseyNumber).doesNotHaveDuplicates();
            assertThat(side.selected().stream().filter(MatchPlayerResponse::isLibero)).hasSize(1);
            assertThat(side.selected()).allSatisfy(player -> assertThat(player.teamId()).isEqualTo(side.team().id()));
        }
        for (String email : java.util.List.of("admin.demo@example.com", "statistician.demo@example.com", "coach.demo@example.com")) {
            mvc.perform(post("/api/auth/login").with(csrf()).param("email", email).param("password", "TestOnly!Password"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(email))
                    .andExpect(jsonPath("$.passwordHash").doesNotExist());
        }
    }

    @Test void repeatedStartupDoesNotDuplicateDataOrResetAnEditedAccount() {
        seed();
        var coach = users.findByEmail("coach.demo@example.com").orElseThrow();
        coach.block(); users.saveAndFlush(coach);
        var team = teams.findAll().getFirst(); team.update("Edited demo team", team.getCity()); teams.saveAndFlush(team);
        var before = users.findAll().stream().collect(java.util.stream.Collectors.toMap(User::getId, User::getPasswordHash));
        var matchId = matches.findAll().getFirst().getId();
        seed();
        assertThat(users.findAll()).allSatisfy(user -> assertThat(user.getPasswordHash()).isEqualTo(before.get(user.getId())));
        assertThat(users.findById(coach.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.BLOCKED);
        assertThat(teams.findById(team.getId()).orElseThrow().getName()).isEqualTo("Edited demo team");
        assertThat(matches.findAll()).extracting(Match::getId).containsExactly(matchId);
        assertThat(players.count()).isEqualTo(18);
        assertThat(participants.count()).isEqualTo(18);
    }

    @Test void concurrentInitializersCreateOnlyOneDataset() throws Exception {
        var first = java.util.concurrent.CompletableFuture.runAsync(this::seed);
        var second = java.util.concurrent.CompletableFuture.runAsync(this::seed);
        java.util.concurrent.CompletableFuture.allOf(first, second).get(20, java.util.concurrent.TimeUnit.SECONDS);
        assertThat(users.count()).isEqualTo(3); assertThat(teams.count()).isEqualTo(2);
        assertThat(players.count()).isEqualTo(18); assertThat(matches.count()).isEqualTo(1);
        assertThat(participants.count()).isEqualTo(18);
    }

    @ParameterizedTest @EnumSource(UserStatus.class)
    void anExistingAccountInAnyStatusPreventsAllSeeding(UserStatus status) {
        var existing = users.saveAndFlush(new User("Existing", "User", "coach.demo@example.com", "original-hash", UserRole.COACH, status));
        seed();
        assertThat(users.count()).isEqualTo(1);
        var unchanged = users.findById(existing.getId()).orElseThrow();
        assertThat(unchanged.getStatus()).isEqualTo(status);
        assertThat(unchanged.getPasswordHash()).isEqualTo("original-hash");
        assertThat(teams.count()).isZero(); assertThat(players.count()).isZero(); assertThat(matches.count()).isZero();
    }

    @Test void existingTeamWithoutAccountsAlsoPreventsSeeding() {
        var existing = teams.saveAndFlush(new Team("Existing", "Novi Sad"));
        seed();
        assertThat(users.count()).isZero();
        assertThat(teams.findAll()).extracting(Team::getId).containsExactly(existing.getId());
        assertThat(players.count()).isZero(); assertThat(matches.count()).isZero();
    }

    @Test void aFailureDuringRosterCreationRollsBackAllSeededData() {
        doThrow(new IllegalStateException("Simulated roster failure")).when(rosters).save(any(), any());
        assertThatThrownBy(this::seed).isInstanceOf(IllegalStateException.class);
        assertThat(users.count()).isZero(); assertThat(teams.count()).isZero();
        assertThat(players.count()).isZero(); assertThat(matches.count()).isZero(); assertThat(participants.count()).isZero();
    }

    @Test void demoMatchCanStartAndRecordPointsUsingNormalServices() {
        seed();
        var match = matches.findAll().getFirst();
        var roster = rosters.get(match.getId());
        var home = roster.home().selected().stream().filter(p -> p.jerseyNumber() <= 6).map(MatchPlayerResponse::id).toList();
        var away = roster.away().selected().stream().filter(p -> p.jerseyNumber() <= 6).map(MatchPlayerResponse::id).toList();
        var started = play.start(match.getId(), new StartMatchRequest(roster.version(), home, away, roster.home().team().id()));
        var state = score.add(match.getId(), started.currentSet().id(), new AddPointRequest(UUID.randomUUID(), 0, roster.home().team().id()));
        assertThat(state.homeScore()).isEqualTo(1); assertThat(state.awayScore()).isZero();
        assertThat(state.substitutions().options()).isNotEmpty();
        assertThat(state.libero().options()).isNotEmpty();
        assertThat(state.court()).isNotNull();
    }
}
