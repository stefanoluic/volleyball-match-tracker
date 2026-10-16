package rs.stefanoluic.volleyball.match.play.substitution;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import rs.stefanoluic.volleyball.match.play.dto.*;
import rs.stefanoluic.volleyball.match.play.score.*;
import rs.stefanoluic.volleyball.match.play.score.dto.*;
import rs.stefanoluic.volleyball.match.play.substitution.dto.*;
import rs.stefanoluic.volleyball.match.roster.*;
import rs.stefanoluic.volleyball.player.*;
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
@AutoConfigureMockMvc @Testcontainers
class SetSubstitutionIntegrationTest {
    @Container static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");
    @DynamicPropertySource static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired MatchRepository matches;
    @Autowired MatchSetRepository sets;
    @Autowired SetLineupRepository lineups;
    @Autowired MatchPlayerRepository participants;
    @Autowired PlayerRepository players;
    @Autowired TeamRepository teams;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired MatchPlayService play;
    @Autowired SetScoreService scores;
    @Autowired SetSubstitutionService service;
    @Autowired SetSubstitutionRepository substitutions;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private Match match;
    private Team home, away;
    private List<UUID> homeIds, awayIds;
    private UUID setId;
    private static final String PASSWORD = "TestOnly!Password";

    @BeforeEach void seed() {
        matches.deleteAll(); players.deleteAll(); teams.deleteAll(); users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad")); away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        match = matches.saveAndFlush(new Match(home, away, Instant.now()));
        homeIds = roster(home); awayIds = roster(away);
        for (UserRole role : UserRole.values()) users.saveAndFlush(new User("Test", "User", email(role), encoder.encode(PASSWORD), role, UserStatus.ACTIVE));
        setId = play.start(match.getId(), new StartMatchRequest(0, homeIds.subList(0,6), awayIds.subList(0,6), home.getId())).currentSet().id();
    }
    private List<UUID> roster(Team team) {
        var result = new ArrayList<UUID>();
        for (int n = 1; n <= 10; n++) result.add(participant(team, n, n == 10));
        return result;
    }
    private UUID participant(Team team, int jersey, boolean libero) {
        var player = players.saveAndFlush(new Player(team, "Marko", "Marković", jersey, libero ? PlayerPosition.LIBERO : PlayerPosition.SETTER));
        return participants.saveAndFlush(new MatchPlayer(match, team, player, libero)).getId();
    }
    private String email(UserRole role) { return role.name().toLowerCase(Locale.ROOT) + "@example.com"; }
    private MockHttpSession login(UserRole role) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).param("email", email(role)).param("password", PASSWORD))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    private String path() { return "/api/matches/" + match.getId() + "/sets/" + setId; }
    private SubstituteRequest request(int version, int out, int in) {
        return new SubstituteRequest(UUID.randomUUID(), version, homeIds.get(out - 1), homeIds.get(in - 1));
    }
    private SetScoreResponse change(int version, int out, int in) { return service.add(match.getId(), setId, request(version, out, in)); }
    private SetScoreResponse point(int version, Team team) { return scores.add(match.getId(), setId, new AddPointRequest(UUID.randomUUID(), version, team.getId())); }
    private SetScoreResponse state() { return scores.get(match.getId(), setId); }
    private SetScoreResponse undo(int version, UUID id) { return service.undo(match.getId(), setId, id, new UndoPointRequest(UUID.randomUUID(), version)); }
    private void conflict(org.assertj.core.api.ThrowableAssert.ThrowingCallable operation) {
        assertThatThrownBy(operation).isInstanceOf(ApiException.class).satisfies(error -> assertThat(((ApiException) error).getStatus().value()).isEqualTo(409));
    }

    @Test void replacementTakesServerSlotWithoutChangingScoreOrInitialLineupAndCoachCanReadIt() throws Exception {
        var result = change(0, 1, 7);
        assertThat(result.version()).isEqualTo(1); assertThat(result.homeScore()).isZero(); assertThat(result.awayScore()).isZero();
        assertThat(result.court().server().id()).isEqualTo(homeIds.get(6));
        assertThat(result.substitutions().homeUsed()).isEqualTo(1); assertThat(result.substitutions().awayUsed()).isZero();
        assertThat(result.substitutions().options()).noneMatch(option -> option.teamId().equals(home.getId()));
        assertThat(play.get(match.getId()).firstSet().homeLineup().getFirst().participant().id()).isEqualTo(homeIds.getFirst());
        mvc.perform(get(path() + "/score").session(login(UserRole.COACH))).andExpect(status().isOk())
                .andExpect(jsonPath("$.court.server.jerseyNumber").value(7))
                .andExpect(jsonPath("$.substitutions.homeUsed").value(1))
                .andExpect(jsonPath("$.substitutions.history[0].outgoing.jerseyNumber").value(1));
    }
    @Test void returningStarterCanOnlyReplaceHisOwnReserveAndCannotLeaveAgain() {
        change(0,1,7);
        conflict(() -> change(1,7,1)); // Another rally is needed between requests by the same team.
        point(1,home);
        conflict(() -> change(2,7,2)); conflict(() -> change(2,7,8));
        var returned = change(2,7,1);
        assertThat(returned.court().server().id()).isEqualTo(homeIds.getFirst());
        assertThat(returned.substitutions().homeUsed()).isEqualTo(2);
        point(3,home);
        conflict(() -> change(4,1,7)); conflict(() -> change(4,2,7));
    }
    @Test void liberoOpponentOnCourtUnregisteredAndBenchOutgoingPlayersAreRejected() {
        for (var input : List.of(request(0,1,10), request(0,1,2), request(0,7,1), request(0,1,1),
                new SubstituteRequest(UUID.randomUUID(),0,homeIds.getFirst(),awayIds.get(6)),
                new SubstituteRequest(UUID.randomUUID(),0,homeIds.getFirst(),UUID.randomUUID()))) {
            conflict(() -> service.add(match.getId(),setId,input));
        }
        assertThat(substitutions.count()).isZero(); assertThat(state().version()).isZero();
    }
    @Test void sixSubstitutionsAreTheLimitIncludingReturns() {
        UUID unused = participant(home,11,false);
        for (int n = 1; n <= 3; n++) {
            change(state().version(),n,n+6); point(state().version(),home);
            change(state().version(),n+6,n); point(state().version(),home);
        }
        assertThat(state().substitutions().homeUsed()).isEqualTo(6);
        assertThat(state().substitutions().options()).noneMatch(option -> option.teamId().equals(home.getId()));
        conflict(() -> service.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),state().version(),homeIds.get(3),unused)));
        assertThat(substitutions.count()).isEqualTo(6);
    }
    @Test void bothTeamsMaySubstituteInSameInterruptionButEachMustWaitForNextRally() {
        change(0,1,7);
        var awayRequest = new SubstituteRequest(UUID.randomUUID(),1,awayIds.getFirst(),awayIds.get(6));
        var result = service.add(match.getId(),setId,awayRequest);
        assertThat(result.substitutions().awayUsed()).isEqualTo(1);
        assertThat(result.substitutions().options()).isEmpty();
        point(2,away);
        assertThat(state().court().server().id()).isEqualTo(awayIds.get(1));
        assertThat(state().court().awayLineup().getLast().participant().id()).isEqualTo(awayIds.get(6));
    }
    @Test void replacementAndReturnKeepTheSameSlotAfterRotations() {
        point(0,away); point(1,home);
        assertThat(state().court().server().id()).isEqualTo(homeIds.get(1));
        var replaced = change(2,2,7);
        assertThat(replaced.court().server().id()).isEqualTo(homeIds.get(6));
        point(3,home);
        assertThat(change(4,7,2).court().server().id()).isEqualTo(homeIds.get(1));
        point(5,away); point(6,home);
        assertThat(state().court().server().id()).isEqualTo(homeIds.get(2));
        assertThat(state().court().homeLineup().getLast().participant().id()).isEqualTo(homeIds.get(1));
    }
    @Test void staleVersionsAndReusedKeysCannotChangeStateAndReplaysDoNotDuplicateOrResurrect() {
        var input = request(0,1,7);
        var applied = service.add(match.getId(),setId,input);
        assertThat(service.add(match.getId(),setId,input).court()).isEqualTo(applied.court());
        conflict(() -> change(0,2,8));
        conflict(() -> service.add(match.getId(),setId,new SubstituteRequest(input.requestId(),0,homeIds.getFirst(),homeIds.get(7))));
        UUID id = applied.substitutions().undoableId();
        var undo = new UndoPointRequest(UUID.randomUUID(),1);
        var cancelled = service.undo(match.getId(),setId,id,undo);
        assertThat(cancelled.substitutions().homeUsed()).isZero();
        assertThat(cancelled.substitutions().history().getFirst().cancelledAt()).isNotNull();
        assertThat(service.add(match.getId(),setId,input).court()).isEqualTo(cancelled.court());
        assertThat(service.undo(match.getId(),setId,id,undo).court()).isEqualTo(cancelled.court());
        assertThat(state().version()).isEqualTo(2);
        conflict(() -> service.undo(match.getId(),setId,id,new UndoPointRequest(undo.requestId(),2)));
        assertThat(substitutions.count()).isEqualTo(1);
    }
    @Test void correctionsMustUndoPointsAndSubstitutionsInReverseOrder() {
        var firstPoint = point(0,away);
        var changed = change(1,2,7);
        assertThat(changed.canUndo()).isFalse(); assertThat(changed.substitutions().pointUndoBlocked()).isTrue();
        conflict(() -> scores.undo(match.getId(),setId,firstPoint.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),2)));
        UUID subId = changed.substitutions().undoableId();
        var later = point(2,home);
        assertThat(later.substitutions().undoableId()).isNull(); conflict(() -> undo(3,subId));
        var rolledBack = scores.undo(match.getId(),setId,later.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),3));
        assertThat(rolledBack.court().server().id()).isEqualTo(awayIds.get(1));
        undo(4,subId);
        var zero = scores.undo(match.getId(),setId,firstPoint.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),5));
        assertThat(zero.court().server().id()).isEqualTo(homeIds.getFirst());
        assertThat(zero.substitutions().homeUsed()).isZero(); assertThat(zero.homeScore()).isZero(); assertThat(zero.awayScore()).isZero();
    }
    @Test void undoOfLatestTeamChangePrecedesOlderChangeEvenAtSameScore() {
        UUID first = change(0,1,7).substitutions().undoableId();
        UUID second = service.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),1,awayIds.getFirst(),awayIds.get(6))).substitutions().undoableId();
        conflict(() -> undo(2,first));
        undo(2,second); undo(3,first);
        assertThat(state().court().server().id()).isEqualTo(homeIds.getFirst());
    }
    @Test void nextSetResetsLimitsAndUsesNewLineupWithoutChangingPriorSet() {
        change(0,1,7);
        for (int n=0;n<25;n++) point(state().version(),home);
        var finished = play.finish(match.getId(),setId,new FinishSetRequest(UUID.randomUUID(),state().version()));
        var last = finished.sets().getLast();
        var next = play.startNext(match.getId(),new StartNextSetRequest(2,setId,last.scoreVersion(),0,
                homeIds.subList(1,7),awayIds.subList(0,6),away.getId()));
        var result = scores.get(match.getId(),next.currentSet().id());
        assertThat(result.substitutions().homeUsed()).isZero(); assertThat(result.substitutions().history()).isEmpty();
        assertThat(result.court().homeLineup().getLast().participant().id()).isEqualTo(homeIds.get(6));
        assertThat(state().court().homeLineup().getFirst().participant().id()).isEqualTo(homeIds.get(6));
        assertThat(state().court().server()).isNull();
    }
    @Test void winningAndFinishedSetsRejectNewChangesButAllowReplay() {
        var request = request(0,1,7); service.add(match.getId(),setId,request);
        for(int n=0;n<25;n++) point(state().version(),home);
        conflict(() -> change(state().version(),2,8));
        assertThat(state().substitutions().options()).isEmpty();
        play.finish(match.getId(),setId,new FinishSetRequest(UUID.randomUUID(),state().version()));
        conflict(() -> change(state().version(),2,8));
        assertThat(service.add(match.getId(),setId,request).substitutions().homeUsed()).isEqualTo(1);
    }
    @Test void roleCsrfValidationAndMatchScopeAreEnforced() throws Exception {
        var request = request(0,1,7); String body = mapper.writeValueAsString(request);
        mvc.perform(post(path()+"/substitutions").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        for (UserRole role : List.of(UserRole.COACH,UserRole.ADMIN))
            mvc.perform(post(path()+"/substitutions").session(login(role)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(post(path()+"/substitutions").session(session).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post(path()+"/substitutions").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        mvc.perform(post(path()+"/substitutions").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        UUID id = state().substitutions().undoableId();
        mvc.perform(post(path()+"/substitutions/"+id+"/undo").session(login(UserRole.COACH)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(new UndoPointRequest(UUID.randomUUID(),1)))).andExpect(status().isForbidden());
        assertThatThrownBy(() -> service.add(UUID.randomUUID(),setId,request)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.undo(match.getId(),setId,UUID.randomUUID(),new UndoPointRequest(UUID.randomUUID(),1))).isInstanceOf(ApiException.class);
    }
    @Test void databaseForeignKeysRejectOpponentParticipants() {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO volleyball.set_substitutions (id,set_id,match_id,team_id,outgoing_participant_id,incoming_participant_id,starting_position,request_id,expected_version,after_point_sequence,home_score,away_score,created_at) VALUES (?,?,?,?,?,?,1,?,0,0,0,0,now())",
                UUID.randomUUID(),setId,match.getId(),home.getId(),homeIds.getFirst(),awayIds.get(6),UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
    private List<Integer> concurrent(IntSupplier first,IntSupplier second) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        java.util.function.Function<IntSupplier,Callable<Integer>> task = action -> () -> {
            if (!start.await(5,TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout");
            try { return action.getAsInt(); } catch (ApiException error) { return error.getStatus().value(); }
        };
        try { var a=executor.submit(task.apply(first)); var b=executor.submit(task.apply(second)); start.countDown();
            return List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
    }
    @Test void concurrentDuplicateRequestsProduceOneChangeAndOneVersion() throws Exception {
        var request = request(0,1,7);
        IntSupplier operation = () -> { service.add(match.getId(),setId,request); return 200; };
        assertThat(concurrent(operation,operation)).containsExactly(200,200);
        assertThat(substitutions.count()).isEqualTo(1); assertThat(state().version()).isEqualTo(1);
    }
    @Test void concurrentSubstitutionAndPointCannotOverwriteEachOther() throws Exception {
        assertThat(concurrent(() -> { change(0,1,7); return 200; }, () -> { point(0,home); return 200; }))
                .containsExactlyInAnyOrder(200,409);
        assertThat(state().version()).isEqualTo(1);
        assertThat(state().homeScore()+state().substitutions().homeUsed()).isEqualTo(1);
    }
}
