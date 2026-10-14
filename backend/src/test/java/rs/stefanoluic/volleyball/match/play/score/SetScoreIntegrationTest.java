package rs.stefanoluic.volleyball.match.play.score;

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
import rs.stefanoluic.volleyball.match.play.*;
import rs.stefanoluic.volleyball.match.play.score.dto.*;
import rs.stefanoluic.volleyball.team.*;
import rs.stefanoluic.volleyball.user.*;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.IntSupplier;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "app.bootstrap-admin.enabled=false"})
@AutoConfigureMockMvc
@Testcontainers
class SetScoreIntegrationTest {
    @Container static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");
    @DynamicPropertySource static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired MatchRepository matches;
    @Autowired MatchSetRepository sets;
    @Autowired SetPointRepository points;
    @Autowired SetScoreService service;
    @Autowired TeamRepository teams;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private Match match;
    private MatchSet set;
    private Team home;
    private Team away;
    private static final String PASSWORD = "TestOnly!Password";

    @BeforeEach void seed() {
        matches.deleteAll(); teams.deleteAll(); users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad"));
        away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        match = new Match(home, away, Instant.now()); match.start(); match = matches.saveAndFlush(match);
        set = sets.saveAndFlush(new MatchSet(match, 1, home));
        for (UserRole role : UserRole.values()) users.saveAndFlush(new User("Test", "User", email(role),
                encoder.encode(PASSWORD), role, UserStatus.ACTIVE));
    }
    private String email(UserRole role) { return role.name().toLowerCase(Locale.ROOT) + "@example.com"; }
    private MockHttpSession login(UserRole role) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf())
                .param("email", email(role)).param("password", PASSWORD)).andExpect(status().isOk())
                .andReturn().getRequest().getSession(false);
    }
    private String path() { return "/api/matches/" + match.getId() + "/sets/" + set.getId(); }
    private AddPointRequest addRequest(int version, Team team) { return new AddPointRequest(UUID.randomUUID(), version, team.getId()); }
    private SetScoreResponse add(int version, Team team) { return service.add(match.getId(), set.getId(), addRequest(version, team)); }
    private SetScoreResponse undo(int version, UUID pointId) {
        return service.undo(match.getId(), set.getId(), pointId, new UndoPointRequest(UUID.randomUUID(), version));
    }
    private org.springframework.test.web.servlet.ResultActions postJson(String suffix, MockHttpSession session, Object input) throws Exception {
        return mvc.perform(post(path() + suffix).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(input)));
    }
    private void conflict(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOf(ApiException.class).satisfies(error ->
                assertThat(((ApiException) error).getStatus().value()).isEqualTo(409));
    }

    @Test void initialScoreIsReadableByCoachAndNoPointCanBeUndone() throws Exception {
        mvc.perform(get(path() + "/score").session(login(UserRole.COACH))).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(0)).andExpect(jsonPath("$.homeScore").value(0))
                .andExpect(jsonPath("$.awayScore").value(0)).andExpect(jsonPath("$.points").isEmpty())
                .andExpect(jsonPath("$.lastActivePoint").isEmpty()).andExpect(jsonPath("$.canRecord").value(true));
    }
    @Test void addPersistsBothSidesAndSnapshotScoreWithIncreasingSequence() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        postJson("/points", session, addRequest(0, home)).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.homeScore").value(1))
                .andExpect(jsonPath("$.points[0].sequenceNumber").value(1));
        postJson("/points", session, addRequest(1, away)).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.homeScore").value(1))
                .andExpect(jsonPath("$.awayScore").value(1)).andExpect(jsonPath("$.points[0].homeScoreAfter").value(1))
                .andExpect(jsonPath("$.points[0].awayScoreAfter").value(1))
                .andExpect(jsonPath("$.points[1].sequenceNumber").value(1));
        assertThat(points.count()).isEqualTo(2);
    }
    @Test void undoPreservesHistoryAndCanStepBackToZeroButNeverBelowZero() {
        var first = add(0, home); UUID firstId = first.lastActivePoint().id();
        var second = add(1, away); UUID secondId = second.lastActivePoint().id();
        var undone = undo(2, secondId);
        assertThat(undone.homeScore()).isEqualTo(1); assertThat(undone.awayScore()).isZero();
        assertThat(undone.version()).isEqualTo(3);
        assertThat(undone.lastActivePoint().id()).isEqualTo(firstId);
        assertThat(undone.points().getFirst().cancelledAt()).isNotNull();
        undone = undo(3, firstId);
        assertThat(undone.homeScore()).isZero(); assertThat(undone.awayScore()).isZero();
        assertThat(undone.lastActivePoint()).isNull();
        conflict(() -> undo(4, firstId));
        assertThat(points.count()).isEqualTo(2);
    }
    @Test void nextPointAfterUndoDoesNotReuseCancelledSequence() {
        UUID id = add(0, home).lastActivePoint().id(); undo(1, id);
        var result = add(2, away);
        assertThat(result.points().getFirst().sequenceNumber()).isEqualTo(2);
        assertThat(result.homeScore()).isZero(); assertThat(result.awayScore()).isEqualTo(1);
    }
    @Test void onlyLastActivePointMayBeCancelled() {
        UUID first = add(0, home).lastActivePoint().id(); add(1, away);
        conflict(() -> undo(2, first));
        assertThat(sets.findById(set.getId()).orElseThrow().getScoreVersion()).isEqualTo(2);
        assertThat(points.findByIdAndSetId(first, set.getId()).orElseThrow().getCancelledAt()).isNull();
    }
    @Test void staleAddAndUndoDoNotOverwriteConcurrentChanges() {
        UUID point = add(0, home).lastActivePoint().id();
        conflict(() -> add(0, away)); conflict(() -> undo(0, point));
        assertThat(points.count()).isEqualTo(1);
    }
    @Test void replayingCommittedAddReturnsCurrentStateWithoutAddingAgainOrResurrecting() {
        var request = addRequest(0, home);
        UUID id = service.add(match.getId(), set.getId(), request).lastActivePoint().id();
        undo(1, id); add(2, away);
        var replay = service.add(match.getId(), set.getId(), request);
        assertThat(replay.version()).isEqualTo(3); assertThat(replay.homeScore()).isZero();
        assertThat(replay.awayScore()).isEqualTo(1); assertThat(points.count()).isEqualTo(2);
        conflict(() -> service.add(match.getId(), set.getId(), new AddPointRequest(request.requestId(), 0, away.getId())));
        conflict(() -> service.add(match.getId(), set.getId(), new AddPointRequest(request.requestId(), 3, home.getId())));
    }
    @Test void undoReplayDoesNotCancelAnotherPointAndKeyCannotBeReused() {
        UUID id = add(0, home).lastActivePoint().id();
        var request = new UndoPointRequest(UUID.randomUUID(), 1);
        service.undo(match.getId(), set.getId(), id, request);
        UUID other = add(2, away).lastActivePoint().id();
        var replay = service.undo(match.getId(), set.getId(), id, request);
        assertThat(replay.awayScore()).isEqualTo(1); assertThat(replay.version()).isEqualTo(3);
        conflict(() -> service.undo(match.getId(), set.getId(), other, request));
        conflict(() -> service.undo(match.getId(), set.getId(), id, new UndoPointRequest(request.requestId(), 3)));
    }
    @Test void nonParticipatingTeamIsRejectedWithoutChangingState() throws Exception {
        postJson("/points", login(UserRole.STATISTICIAN), new AddPointRequest(UUID.randomUUID(), 0, UUID.randomUUID()))
                .andExpect(status().isBadRequest());
        assertThat(points.count()).isZero();
        assertThat(sets.findById(set.getId()).orElseThrow().getScoreVersion()).isZero();
    }
    @ParameterizedTest
    @EnumSource(value = MatchStatus.class, names = {"SCHEDULED", "FINISHED"})
    void matchMustBeLiveForNewWrites(MatchStatus statusValue) throws Exception {
        UUID id = add(0, home).lastActivePoint().id();
        jdbc.update("UPDATE volleyball.matches SET status=? WHERE id=?", statusValue.name(), match.getId());
        var session = login(UserRole.STATISTICIAN);
        postJson("/points", session, addRequest(1, away)).andExpect(status().isConflict());
        postJson("/points/" + id + "/undo", session, new UndoPointRequest(UUID.randomUUID(), 1)).andExpect(status().isConflict());
        mvc.perform(get(path() + "/score").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.canRecord").value(false));
    }
    @Test void finishedSetRejectsNewWritesButAllowsIdempotentReplay() throws Exception {
        var request = addRequest(0, home);
        UUID id = service.add(match.getId(), set.getId(), request).lastActivePoint().id();
        jdbc.update("UPDATE volleyball.match_sets SET status='FINISHED' WHERE id=?", set.getId());
        conflict(() -> add(1, away)); conflict(() -> undo(1, id));
        assertThat(service.add(match.getId(), set.getId(), request).homeScore()).isEqualTo(1);
    }
    @Test void setMustBelongToMatchAndPointMustBelongToSet() throws Exception {
        Match other = new Match(home, away, Instant.now()); other.start(); other = matches.saveAndFlush(other);
        MatchSet otherSet = sets.saveAndFlush(new MatchSet(other, 1, home));
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(get("/api/matches/" + match.getId() + "/sets/" + otherSet.getId() + "/score").session(session))
                .andExpect(status().isNotFound());
        UUID otherPoint = service.add(other.getId(), otherSet.getId(), addRequest(0, home)).lastActivePoint().id();
        postJson("/points/" + otherPoint + "/undo", session, new UndoPointRequest(UUID.randomUUID(), 0))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/matches/" + UUID.randomUUID() + "/sets/" + set.getId() + "/score").session(session))
                .andExpect(status().isNotFound());
        postJson("/points/" + UUID.randomUUID() + "/undo", session, new UndoPointRequest(UUID.randomUUID(), 0))
                .andExpect(status().isNotFound());
    }
    @Test void recentHistoryIsBoundedAndCancelledEntriesRemainVisible() {
        SetScoreResponse result = null;
        for (int index = 0; index < 24; index++) result = add(index, home);
        result = undo(24, result.lastActivePoint().id());
        assertThat(result.points()).hasSize(20);
        assertThat(result.points().getFirst().sequenceNumber()).isEqualTo(24);
        assertThat(result.points().getFirst().cancelledAt()).isNotNull();
        assertThat(result.lastActivePoint().sequenceNumber()).isEqualTo(23);
        assertThat(points.count()).isEqualTo(24);
        assertThat(result.homeScore()).isEqualTo(23);
    }
    @Test void authorizationAndCsrfApplyToScoreEndpoints() throws Exception {
        mvc.perform(get(path() + "/score")).andExpect(status().isUnauthorized());
        mvc.perform(post(path() + "/points").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(addRequest(0, home)))).andExpect(status().isUnauthorized());
        var coach = login(UserRole.COACH);
        postJson("/points", coach, addRequest(0, home)).andExpect(status().isForbidden());
        postJson("/points/" + UUID.randomUUID() + "/undo", coach, new UndoPointRequest(UUID.randomUUID(), 0)).andExpect(status().isForbidden());
        var admin = login(UserRole.ADMIN);
        mvc.perform(get(path() + "/score").session(admin)).andExpect(status().isForbidden());
        postJson("/points", admin, addRequest(0, home)).andExpect(status().isForbidden());
        var statistician = login(UserRole.STATISTICIAN);
        mvc.perform(post(path() + "/points").session(statistician).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(addRequest(0, home)))).andExpect(status().isForbidden());
    }
    @Test void invalidPayloadsAreRejected() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        for (String field : List.of("requestId", "version", "scoringTeamId")) {
            Map<String,Object> data = new HashMap<>(Map.of("requestId", UUID.randomUUID(), "version", 0, "scoringTeamId", home.getId()));
            data.remove(field); postJson("/points", session, data).andExpect(status().isBadRequest());
            data.put(field, null); postJson("/points", session, data).andExpect(status().isBadRequest());
        }
        for (Object invalid : List.of(-1, 0.5, "invalid")) {
            postJson("/points", session, Map.of("requestId", UUID.randomUUID(), "version", invalid, "scoringTeamId", home.getId()))
                    .andExpect(status().isBadRequest());
        }
        postJson("/points/" + UUID.randomUUID() + "/undo", session, Map.of()).andExpect(status().isBadRequest());
        assertThat(points.count()).isZero();
    }
    @Test void databaseChecksCancellationFieldsAndCascadesPointHistory() {
        UUID id = add(0, home).lastActivePoint().id();
        assertThatThrownBy(() -> jdbc.update("UPDATE volleyball.set_points SET cancelled_at=CURRENT_TIMESTAMP WHERE id=?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE volleyball.match_sets SET home_score=-1 WHERE id=?", set.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        matches.deleteAll();
        assertThat(points.count()).isZero();
    }
    private List<Integer> concurrent(IntSupplier first, IntSupplier second) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch signal = new CountDownLatch(1);
        java.util.function.Function<IntSupplier, Callable<Integer>> task = operation -> () -> {
            if (!signal.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout");
            try { return operation.getAsInt(); }
            catch (ApiException error) { return error.getStatus().value(); }
        };
        try {
            var a = executor.submit(task.apply(first)); var b = executor.submit(task.apply(second)); signal.countDown();
            return List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
    }
    @Test void concurrentDifferentAddsAllowOnlyOneVersionedWrite() throws Exception {
        assertThat(concurrent(() -> { add(0, home); return 200; }, () -> { add(0, away); return 200; }))
                .containsExactlyInAnyOrder(200, 409);
        assertThat(points.count()).isEqualTo(1);
    }
    @Test void concurrentRetriesOfSameCommandRecordExactlyOnePoint() throws Exception {
        var request = addRequest(0, home);
        IntSupplier operation = () -> { service.add(match.getId(), set.getId(), request); return 200; };
        assertThat(concurrent(operation, operation)).containsExactly(200, 200);
        assertThat(points.count()).isEqualTo(1);
        assertThat(sets.findById(set.getId()).orElseThrow().getHomeScore()).isEqualTo(1);
    }
    @Test void simultaneousUndosAndAddVersusUndoNeverLoseOrDoubleApplyChanges() throws Exception {
        UUID id = add(0, home).lastActivePoint().id();
        assertThat(concurrent(() -> { undo(1, id); return 200; }, () -> { undo(1, id); return 200; }))
                .containsExactlyInAnyOrder(200, 409);
        assertThat(sets.findById(set.getId()).orElseThrow().getHomeScore()).isZero();
        UUID next = add(2, home).lastActivePoint().id();
        assertThat(concurrent(() -> { add(3, away); return 200; }, () -> { undo(3, next); return 200; }))
                .containsExactlyInAnyOrder(200, 409);
        assertThat(sets.findById(set.getId()).orElseThrow().getScoreVersion()).isEqualTo(4);
    }
}
