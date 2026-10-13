package rs.stefanoluic.volleyball.match.roster;

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
import rs.stefanoluic.volleyball.match.roster.dto.*;
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
class MatchRosterIntegrationTest {
    @Container static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");
    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired MatchRepository matches;
    @Autowired MatchPlayerRepository entries;
    @Autowired MatchRosterService service;
    @Autowired PlayerRepository players;
    @Autowired TeamRepository teams;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    private Team home;
    private Team away;
    private Player homePlayer;
    private Player awayPlayer;
    private Match match;
    private static final String PASSWORD = "TestOnly!Password";

    @BeforeEach
    void seed() {
        matches.deleteAll();
        players.deleteAll();
        teams.deleteAll();
        users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad"));
        away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        homePlayer = player(home, 7);
        awayPlayer = player(away, 7);
        match = matches.saveAndFlush(new Match(home, away, Instant.parse("2026-10-15T16:00:00Z")));
        for (UserRole role : UserRole.values()) users.saveAndFlush(new User("Test", "User", email(role),
                encoder.encode(PASSWORD), role, UserStatus.ACTIVE));
    }

    private Player player(Team team, int jersey) {
        return players.saveAndFlush(new Player(team, "Marko", "Marković", jersey, PlayerPosition.SETTER));
    }
    private String email(UserRole role) { return role.name().toLowerCase(Locale.ROOT) + "@example.com"; }
    private MockHttpSession login(UserRole role) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf())
                .param("email", email(role)).param("password", PASSWORD)).andExpect(status().isOk())
                .andReturn().getRequest().getSession(false);
    }
    private String path() { return "/api/matches/" + match.getId() + "/roster"; }
    private Map<String, Object> selected(Player player, boolean libero) {
        return Map.of("playerId", player.getId(), "isLibero", libero);
    }
    private Map<String, Object> input() {
        return new HashMap<>(Map.of("version", 0, "homePlayers", List.of(selected(homePlayer, false)),
                "awayPlayers", List.of(selected(awayPlayer, true))));
    }
    private org.springframework.test.web.servlet.ResultActions save(MockHttpSession session, Map<String, Object> data) throws Exception {
        return mvc.perform(put(path()).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(data)));
    }

    @Test
    void savesBothTeamsAndCoachReadsSnapshotAndAvailablePlayers() throws Exception {
        save(login(UserRole.STATISTICIAN), input()).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.home.selected[0].playerId").value(homePlayer.getId().toString()))
                .andExpect(jsonPath("$.home.selected[0].teamId").value(home.getId().toString()))
                .andExpect(jsonPath("$.away.selected[0].isLibero").value(true));
        mvc.perform(get(path()).session(login(UserRole.COACH))).andExpect(status().isOk())
                .andExpect(jsonPath("$.home.available[0].id").value(homePlayer.getId().toString()))
                .andExpect(jsonPath("$.home.selected[0].jerseyNumber").value(7));
        assertThat(entries.count()).isEqualTo(2);
    }

    @Test
    void emptyAndPartialDraftsAreAllowedAndRetainedEntriesKeepTheirIdentifiers() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        var data = input();
        data.put("awayPlayers", List.of());
        save(session, data).andExpect(status().isOk());
        UUID entryId = entries.findByMatchIdOrderByJerseyNumberAscIdAsc(match.getId()).getFirst().getId();
        data.put("version", 1);
        data.put("homePlayers", List.of(selected(homePlayer, true)));
        save(session, data).andExpect(status().isOk()).andExpect(jsonPath("$.home.selected[0].isLibero").value(true));
        assertThat(entries.findByMatchIdOrderByJerseyNumberAscIdAsc(match.getId()).getFirst().getId()).isEqualTo(entryId);
        data.put("version", 2);
        data.put("homePlayers", List.of());
        save(session, data).andExpect(status().isOk()).andExpect(jsonPath("$.home.selected").isEmpty());
        assertThat(entries.count()).isZero();
    }

    @Test
    void snapshotDoesNotChangeAfterEditingPlayerOrSavingAgain() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        save(session, input()).andExpect(status().isOk());
        jdbc.update("UPDATE volleyball.players SET first_name='Petar', jersey_number=12, position='LIBERO' WHERE id=?", homePlayer.getId());
        var data = input();
        data.put("version", 1);
        save(session, data).andExpect(status().isOk())
                .andExpect(jsonPath("$.home.selected[0].firstName").value("Marko"))
                .andExpect(jsonPath("$.home.selected[0].jerseyNumber").value(7))
                .andExpect(jsonPath("$.home.selected[0].position").value("SETTER"))
                .andExpect(jsonPath("$.home.available[0].jerseyNumber").value(12));
    }

    @Test
    void historicalTeamIsRetainedEvenIfCurrentPlayerTeamChanges() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        var data = input();
        data.put("awayPlayers", List.of());
        save(session, data).andExpect(status().isOk());
        Team third = teams.saveAndFlush(new Team("Third", "Niš"));
        jdbc.update("UPDATE volleyball.players SET team_id=? WHERE id=?", third.getId(), homePlayer.getId());
        data.put("version", 1);
        save(session, data).andExpect(status().isOk())
                .andExpect(jsonPath("$.home.selected[0].teamId").value(home.getId().toString()))
                .andExpect(jsonPath("$.home.available").isEmpty());
    }

    @Test
    void wrongTeamMissingAndDuplicatePlayersAreRejectedWithoutPartialWrites() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        for (var wrong : List.of(
                List.of(selected(awayPlayer, false)),
                List.of(Map.of("playerId", UUID.randomUUID(), "isLibero", false)),
                List.of(selected(homePlayer, false), selected(homePlayer, true)))) {
            var data = input();
            data.put("homePlayers", wrong);
            save(session, data).andExpect(status().isBadRequest());
        }
        var data = input();
        data.put("awayPlayers", List.of(selected(homePlayer, false)));
        save(session, data).andExpect(status().isBadRequest());
        assertThat(entries.count()).isZero();
        assertThat(matches.findById(match.getId()).orElseThrow().getRosterVersion()).isZero();
    }

    @Test
    void permitsTwoLiberosButRejectsThree() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        Player second = player(home, 8);
        Player third = player(home, 9);
        var data = input();
        data.put("homePlayers", List.of(selected(homePlayer, true), selected(second, true), selected(third, true)));
        save(session, data).andExpect(status().isBadRequest());
        data.put("homePlayers", List.of(selected(homePlayer, true), selected(second, true)));
        save(session, data).andExpect(status().isOk());
    }

    @Test
    void staleVersionIsRejectedAndPreservesSavedRoster() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        save(session, input()).andExpect(status().isOk());
        var stale = input();
        stale.put("homePlayers", List.of());
        save(session, stale).andExpect(status().isConflict());
        assertThat(entries.count()).isEqualTo(2);
    }

    @ParameterizedTest
    @EnumSource(value = MatchStatus.class, names = {"LIVE", "FINISHED"})
    void nonScheduledRosterIsReadOnly(MatchStatus status) throws Exception {
        jdbc.update("UPDATE volleyball.matches SET status=? WHERE id=?", status.name(), match.getId());
        var session = login(UserRole.STATISTICIAN);
        save(session, input()).andExpect(status().isConflict());
        mvc.perform(get(path()).session(session)).andExpect(status().isOk());
    }

    @Test
    void playerDeletionAndMatchTeamChangesAreProtectedUntilRosterIsCleared() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        save(session, input()).andExpect(status().isOk());
        mvc.perform(delete("/api/teams/" + home.getId() + "/players/" + homePlayer.getId())
                .session(session).with(csrf())).andExpect(status().isConflict());
        var edit = new HashMap<>(Map.of("homeTeamId", away.getId(), "awayTeamId", home.getId(),
                "scheduledAt", "2026-10-16T16:00:00Z"));
        mvc.perform(put("/api/matches/" + match.getId()).session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(edit))).andExpect(status().isConflict());
        edit.put("homeTeamId", home.getId());
        edit.put("awayTeamId", away.getId());
        mvc.perform(put("/api/matches/" + match.getId()).session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(edit))).andExpect(status().isOk());
        save(session, new HashMap<>(Map.of("version", 1, "homePlayers", List.of(), "awayPlayers", List.of())))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/teams/" + home.getId() + "/players/" + homePlayer.getId())
                .session(session).with(csrf())).andExpect(status().isNoContent());
    }

    @Test
    void deletingScheduledMatchCascadesOnlyParticipationRows() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        save(session, input()).andExpect(status().isOk());
        mvc.perform(delete("/api/matches/" + match.getId()).session(session).with(csrf())).andExpect(status().isNoContent());
        assertThat(entries.count()).isZero();
        assertThat(players.count()).isEqualTo(2);
        assertThat(teams.count()).isEqualTo(2);
    }

    @Test
    void databaseProtectsPlayerForeignKeyAndDuplicateParticipation() {
        entries.saveAndFlush(new MatchPlayer(match, home, homePlayer, false));
        assertThatThrownBy(() -> entries.saveAndFlush(new MatchPlayer(match, home, homePlayer, false)))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> players.deleteById(homePlayer.getId())).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(players.existsById(homePlayer.getId())).isTrue();
    }

    @Test
    void retainedSnapshotJerseyCannotCollideWithNewSelectionAndRollbackPreservesBothTeams() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        save(session, input()).andExpect(status().isOk());
        jdbc.update("UPDATE volleyball.players SET jersey_number=12 WHERE id=?", homePlayer.getId());
        Player replacement = player(home, 7);
        var data = input();
        data.put("version", 1);
        data.put("homePlayers", List.of(selected(homePlayer, false), selected(replacement, false)));
        save(session, data).andExpect(status().isConflict());
        assertThat(entries.count()).isEqualTo(2);
        data.put("homePlayers", List.of(selected(replacement, false)));
        save(session, data).andExpect(status().isOk())
                .andExpect(jsonPath("$.home.selected[0].playerId").value(replacement.getId().toString()));
    }

    @Test
    void authorizationCsrfAndUnknownMatchAreHandled() throws Exception {
        mvc.perform(get(path())).andExpect(status().isUnauthorized());
        mvc.perform(put(path()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(input()))).andExpect(status().isUnauthorized());
        save(login(UserRole.COACH), input()).andExpect(status().isForbidden());
        var admin = login(UserRole.ADMIN);
        mvc.perform(get(path()).session(admin)).andExpect(status().isForbidden());
        save(admin, input()).andExpect(status().isForbidden());
        var statistician = login(UserRole.STATISTICIAN);
        mvc.perform(put(path()).session(statistician).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(input()))).andExpect(status().isForbidden());
        mvc.perform(get("/api/matches/" + UUID.randomUUID() + "/roster").session(statistician)).andExpect(status().isNotFound());
    }

    @Test
    void invalidPayloadsAreRejected() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        for (String json : new String[]{
                "{}", "{\"version\":-1,\"homePlayers\":[],\"awayPlayers\":[]}",
                "{\"version\":0,\"homePlayers\":[null],\"awayPlayers\":[]}",
                "{\"version\":0,\"homePlayers\":[{}],\"awayPlayers\":[]}",
                "{\"version\":0,\"homePlayers\":null,\"awayPlayers\":[]}",
                "{\"version\":1.5,\"homePlayers\":[],\"awayPlayers\":[]}"}) {
            mvc.perform(put(path()).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content(json)).andExpect(status().isBadRequest());
        }
    }

    @Test
    void simultaneousSavesWithSameVersionDoNotOverwriteEachOther() throws Exception {
        var request = new MatchRosterRequest(0, List.of(new RosterPlayerRequest(homePlayer.getId(), false)), List.of());
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<Integer> save = () -> {
            if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout");
            try { service.save(match.getId(), request); return 200; }
            catch (ApiException error) { return error.getStatus().value(); }
        };
        try {
            Future<Integer> first = executor.submit(save);
            Future<Integer> second = executor.submit(save);
            start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
            assertThat(entries.count()).isEqualTo(1);
        } finally { executor.shutdownNow(); }
    }
}
