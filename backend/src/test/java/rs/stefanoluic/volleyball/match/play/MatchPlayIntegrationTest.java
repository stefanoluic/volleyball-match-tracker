package rs.stefanoluic.volleyball.match.play;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.*;
import rs.stefanoluic.volleyball.match.play.dto.StartMatchRequest;
import rs.stefanoluic.volleyball.match.roster.*;
import rs.stefanoluic.volleyball.player.*;
import rs.stefanoluic.volleyball.team.*;
import rs.stefanoluic.volleyball.user.*;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "app.bootstrap-admin.enabled=false"})
@AutoConfigureMockMvc
@Testcontainers
class MatchPlayIntegrationTest {
    @Container static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");
    @DynamicPropertySource static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired MatchRepository matches;
    @Autowired TeamRepository teams;
    @Autowired PlayerRepository players;
    @Autowired MatchPlayerRepository participants;
    @Autowired MatchSetRepository sets;
    @Autowired SetLineupRepository lineups;
    @Autowired MatchPlayService service;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    private Team home;
    private Team away;
    private Match match;
    private List<MatchPlayer> homePlayers;
    private List<MatchPlayer> awayPlayers;
    private static final String PASSWORD = "TestOnly!Password";
    @BeforeEach void seed() {
        matches.deleteAll();
        players.deleteAll();
        teams.deleteAll();
        users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad"));
        away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        match = matches.saveAndFlush(new Match(home, away, Instant.parse("2026-10-15T16:00:00Z")));
        homePlayers = roster(home);
        awayPlayers = roster(away);
        for (UserRole role : UserRole.values()) users.saveAndFlush(new User("Test", "User", email(role),
                encoder.encode(PASSWORD), role, UserStatus.ACTIVE));
    }
    private List<MatchPlayer> roster(Team team) {
        List<MatchPlayer> rows = new ArrayList<>();
        for (int number = 1; number <= 8; number++) {
            Player player = players.saveAndFlush(new Player(team, "Marko", "Marković", number,
                    number == 8 ? PlayerPosition.LIBERO : PlayerPosition.SETTER));
            rows.add(participants.saveAndFlush(new MatchPlayer(match, team, player, number == 8)));
        }
        return rows;
    }
    private String email(UserRole role) { return role.name().toLowerCase(Locale.ROOT) + "@example.com"; }
    private MockHttpSession login(UserRole role) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf())
                .param("email", email(role)).param("password", PASSWORD)).andExpect(status().isOk())
                .andReturn().getRequest().getSession(false);
    }
    private String path() { return "/api/matches/" + match.getId(); }
    private List<UUID> ids(List<MatchPlayer> rows) { return rows.stream().limit(6).map(MatchPlayer::getId).toList(); }
    private Map<String, Object> input() {
        return new HashMap<>(Map.of("rosterVersion", 0, "homeLineup", ids(homePlayers),
                "awayLineup", ids(awayPlayers), "firstServingTeamId", away.getId()));
    }
    private org.springframework.test.web.servlet.ResultActions start(MockHttpSession session, Map<String, Object> data) throws Exception {
        return mvc.perform(post(path() + "/start").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(data)));
    }
    private void unchanged() {
        assertThat(sets.count()).isZero();
        assertThat(lineups.count()).isZero();
        assertThat(matches.findById(match.getId()).orElseThrow().getStatus()).isEqualTo(MatchStatus.SCHEDULED);
    }
    @Test void coachCanReadPreparationBeforeStart() throws Exception {
        mvc.perform(get(path() + "/preparation").session(login(UserRole.COACH))).andExpect(status().isOk())
                .andExpect(jsonPath("$.firstSet").isEmpty()).andExpect(jsonPath("$.roster.home.selected.length()").value(8));
    }
    @Test void startStoresOrderedPostavesAndZeroScoresInOneTransaction() throws Exception {
        var data = input();
        List<UUID> reversed = new ArrayList<>(ids(homePlayers));
        Collections.reverse(reversed);
        data.put("homeLineup", reversed);
        start(login(UserRole.STATISTICIAN), data).andExpect(status().isOk())
                .andExpect(jsonPath("$.roster.match.status").value("LIVE"))
                .andExpect(jsonPath("$.firstSet.number").value(1))
                .andExpect(jsonPath("$.firstSet.status").value("LIVE"))
                .andExpect(jsonPath("$.firstSet.homeScore").value(0))
                .andExpect(jsonPath("$.firstSet.awayScore").value(0))
                .andExpect(jsonPath("$.firstSet.firstServingTeamId").value(away.getId().toString()))
                .andExpect(jsonPath("$.firstSet.startedAt").isNotEmpty())
                .andExpect(jsonPath("$.firstSet.homeLineup.length()").value(6))
                .andExpect(jsonPath("$.firstSet.awayLineup.length()").value(6))
                .andExpect(jsonPath("$.firstSet.homeLineup[0].rotationPosition").value(1))
                .andExpect(jsonPath("$.firstSet.homeLineup[0].participant.id").value(reversed.getFirst().toString()));
        assertThat(sets.count()).isEqualTo(1);
        assertThat(lineups.count()).isEqualTo(12);
        assertThat(participants.count()).isEqualTo(16);
    }
    @Test void incorrectLengthsAndDuplicatePlayersAreRejected() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        for (var invalid : List.of(ids(homePlayers).subList(0, 5),
                homePlayers.stream().limit(7).map(MatchPlayer::getId).toList(),
                Collections.nCopies(6, homePlayers.getFirst().getId()))) {
            var data = input(); data.put("homeLineup", invalid);
            start(session, data).andExpect(status().isBadRequest());
        }
        unchanged();
    }
    @Test void wrongTeamUnknownAndOtherMatchParticipantsAreRejected() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        Match otherMatch = matches.saveAndFlush(new Match(home, away, Instant.now()));
        MatchPlayer other = participants.saveAndFlush(new MatchPlayer(otherMatch, home, homePlayers.getFirst().getPlayer(), false));
        for (UUID invalid : List.of(awayPlayers.getFirst().getId(), UUID.randomUUID(), other.getId(),
                homePlayers.getFirst().getPlayer().getId())) {
            List<UUID> lineup = new ArrayList<>(ids(homePlayers)); lineup.set(0, invalid);
            var data = input(); data.put("homeLineup", lineup);
            start(session, data).andExpect(status().isBadRequest());
        }
        unchanged();
    }
    @Test void invalidAwayLineupDoesNotPartiallyStartHomeTeam() throws Exception {
        var data = input(); data.put("awayLineup", ids(homePlayers));
        start(login(UserRole.STATISTICIAN), data).andExpect(status().isBadRequest());
        unchanged();
    }
    @Test void registeredLiberoCannotStartButPrimaryPositionAloneIsNotABan() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        List<UUID> lineup = new ArrayList<>(ids(homePlayers)); lineup.set(0, homePlayers.get(7).getId());
        var data = input(); data.put("homeLineup", lineup);
        start(session, data).andExpect(status().isBadRequest());
        unchanged();
        jdbc.update("UPDATE volleyball.match_players SET position='LIBERO' WHERE id=?", homePlayers.getFirst().getId());
        start(session, input()).andExpect(status().isOk());
    }
    @Test void firstServingTeamMustBelongToMatch() throws Exception {
        var data = input(); data.put("firstServingTeamId", UUID.randomUUID());
        start(login(UserRole.STATISTICIAN), data).andExpect(status().isBadRequest());
        unchanged();
    }
    @Test void staleRosterVersionIsRejected() throws Exception {
        jdbc.update("UPDATE volleyball.matches SET roster_version=1 WHERE id=?", match.getId());
        start(login(UserRole.STATISTICIAN), input()).andExpect(status().isConflict());
        unchanged();
    }
    @ParameterizedTest
    @EnumSource(value = MatchStatus.class, names = {"LIVE", "FINISHED"})
    void onlyScheduledMatchCanStart(MatchStatus matchStatus) throws Exception {
        jdbc.update("UPDATE volleyball.matches SET status=? WHERE id=?", matchStatus.name(), match.getId());
        start(login(UserRole.STATISTICIAN), input()).andExpect(status().isConflict());
        assertThat(sets.count()).isZero();
    }
    @Test void repeatedStartDoesNotCreateAnotherSetOrReplaceInitialLineups() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        start(session, input()).andExpect(status().isOk());
        var changed = input(); changed.put("firstServingTeamId", home.getId());
        start(session, changed).andExpect(status().isConflict());
        mvc.perform(get(path() + "/preparation").session(login(UserRole.COACH))).andExpect(status().isOk())
                .andExpect(jsonPath("$.firstSet.firstServingTeamId").value(away.getId().toString()));
        assertThat(sets.count()).isEqualTo(1);
        assertThat(lineups.count()).isEqualTo(12);
    }
    @Test void startedMatchRejectsRosterAndFixtureWritesAndPreservesSnapshot() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        start(session, input()).andExpect(status().isOk());
        mvc.perform(put(path() + "/roster").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("version", 0, "homePlayers", List.of(), "awayPlayers", List.of()))))
                .andExpect(status().isConflict());
        mvc.perform(delete(path()).session(session).with(csrf())).andExpect(status().isConflict());
        mvc.perform(put(path()).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("homeTeamId", home.getId(), "awayTeamId", away.getId(),
                        "scheduledAt", "2026-10-16T16:00:00Z")))).andExpect(status().isConflict());
        jdbc.update("UPDATE volleyball.players SET first_name='Petar', jersey_number=20 WHERE id=?",
                homePlayers.getFirst().getPlayer().getId());
        mvc.perform(get(path() + "/preparation").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.firstSet.homeLineup[0].participant.firstName").value("Marko"))
                .andExpect(jsonPath("$.firstSet.homeLineup[0].participant.jerseyNumber").value(1));
    }
    @Test void authorizationCsrfAndMissingMatchAreHandled() throws Exception {
        mvc.perform(get(path() + "/preparation")).andExpect(status().isUnauthorized());
        mvc.perform(post(path() + "/start").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(input()))).andExpect(status().isUnauthorized());
        start(login(UserRole.COACH), input()).andExpect(status().isForbidden());
        var admin = login(UserRole.ADMIN);
        mvc.perform(get(path() + "/preparation").session(admin)).andExpect(status().isForbidden());
        start(admin, input()).andExpect(status().isForbidden());
        var statistician = login(UserRole.STATISTICIAN);
        mvc.perform(post(path() + "/start").session(statistician).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(input()))).andExpect(status().isForbidden());
        mvc.perform(get("/api/matches/" + UUID.randomUUID() + "/preparation").session(statistician)).andExpect(status().isNotFound());
        mvc.perform(post("/api/matches/" + UUID.randomUUID() + "/start").session(statistician).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(input()))).andExpect(status().isNotFound());
    }
    @Test void missingNullAndMalformedFieldsAreRejected() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        for (String field : List.of("homeLineup", "awayLineup", "firstServingTeamId", "rosterVersion")) {
            var data = input(); data.remove(field);
            start(session, data).andExpect(status().isBadRequest());
            data.put(field, null); start(session, data).andExpect(status().isBadRequest());
        }
        var data = input(); data.put("rosterVersion", -1);
        start(session, data).andExpect(status().isBadRequest());
        data.put("rosterVersion", 0.5); start(session, data).andExpect(status().isBadRequest());
        data = input(); data.put("homeLineup", Arrays.asList(null, null, null, null, null, null));
        start(session, data).andExpect(status().isBadRequest());
        data.put("homeLineup", List.of("invalid-uuid")); start(session, data).andExpect(status().isBadRequest());
        unchanged();
    }
    @Test void databaseGuardsSlotsAndCrossMatchReferencesAndCascadesCleanup() throws Exception {
        start(login(UserRole.STATISTICIAN), input()).andExpect(status().isOk());
        UUID setId = sets.findByMatchIdAndNumber(match.getId(), 1).orElseThrow().getId();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO volleyball.set_lineups (id,set_id,match_id,team_id,match_player_id,rotation_position) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), setId, match.getId(), home.getId(), homePlayers.get(6).getId(), 1))
                .isInstanceOf(DataIntegrityViolationException.class);
        Match other = matches.saveAndFlush(new Match(home, away, Instant.now()));
        assertThatThrownBy(() -> jdbc.update("INSERT INTO volleyball.set_lineups (id,set_id,match_id,team_id,match_player_id,rotation_position) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), setId, other.getId(), home.getId(), homePlayers.get(6).getId(), 6))
                .isInstanceOf(DataIntegrityViolationException.class);
        matches.deleteAll();
        assertThat(sets.count()).isZero();
        assertThat(lineups.count()).isZero();
        assertThat(participants.count()).isZero();
        assertThat(players.count()).isEqualTo(16);
    }
    @Test void simultaneousStartsAllowOnlyOneSuccessfulTransition() throws Exception {
        var request = new StartMatchRequest(0, ids(homePlayers), ids(awayPlayers), home.getId());
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch signal = new CountDownLatch(1);
        Callable<Integer> start = () -> {
            if (!signal.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout");
            try { service.start(match.getId(), request); return 200; }
            catch (ApiException error) { return error.getStatus().value(); }
        };
        try {
            var first = executor.submit(start); var second = executor.submit(start); signal.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
            assertThat(sets.count()).isEqualTo(1);
            assertThat(lineups.count()).isEqualTo(12);
        } finally { executor.shutdownNow(); }
    }
}
