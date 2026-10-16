package rs.stefanoluic.volleyball.match.play.libero;

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
import rs.stefanoluic.volleyball.match.play.substitution.*;
import rs.stefanoluic.volleyball.match.play.substitution.dto.SubstituteRequest;
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
class LiberoReplacementIntegrationTest {
    @Container static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");
    @DynamicPropertySource static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired MatchRepository matches;
    @Autowired MatchSetRepository sets;
    @Autowired MatchPlayerRepository participants;
    @Autowired PlayerRepository players;
    @Autowired TeamRepository teams;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired MatchPlayService play;
    @Autowired SetScoreService scores;
    @Autowired SetSubstitutionService ordinary;
    @Autowired LiberoReplacementService service;
    @Autowired LiberoReplacementRepository replacements;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private Match match;
    private Team home, away;
    private List<UUID> hp, ap;
    private UUID setId;
    private static final String PASSWORD = "TestOnly!Password";
    @BeforeEach void seed() {
        matches.deleteAll(); players.deleteAll(); teams.deleteAll(); users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad")); away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        match = matches.saveAndFlush(new Match(home, away, Instant.now())); hp = roster(home); ap = roster(away);
        for (UserRole role : UserRole.values()) users.saveAndFlush(new User("Test", "User", email(role), encoder.encode(PASSWORD), role, UserStatus.ACTIVE));
        setId = play.start(match.getId(),new StartMatchRequest(0,hp.subList(0,6),ap.subList(0,6),home.getId())).currentSet().id();
    }
    private List<UUID> roster(Team team) {
        var result = new ArrayList<UUID>();
        for(int n=1;n<=11;n++) {
            var player = players.saveAndFlush(new Player(team,"Marko","Marković",n,n>=10 ? PlayerPosition.LIBERO : PlayerPosition.SETTER));
            result.add(participants.saveAndFlush(new MatchPlayer(match,team,player,n>=10)).getId());
        }
        return result;
    }
    private String email(UserRole role) { return role.name().toLowerCase(Locale.ROOT)+"@example.com"; }
    private MockHttpSession login(UserRole role) throws Exception {
        return (MockHttpSession)mvc.perform(post("/api/auth/login").with(csrf()).param("email",email(role)).param("password",PASSWORD))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    private String path() { return "/api/matches/"+match.getId()+"/sets/"+setId; }
    private SubstituteRequest request(int version,int out,int in) { return new SubstituteRequest(UUID.randomUUID(),version,hp.get(out-1),hp.get(in-1)); }
    private SetScoreResponse change(int version,int out,int in) { return service.add(match.getId(),setId,request(version,out,in)); }
    private SetScoreResponse point(int version,Team team) { return scores.add(match.getId(),setId,new AddPointRequest(UUID.randomUUID(),version,team.getId())); }
    private SetScoreResponse state() { return scores.get(match.getId(),setId); }
    private SetScoreResponse undo(int version,UUID id) { return service.undo(match.getId(),setId,id,new UndoPointRequest(UUID.randomUUID(),version)); }
    private void conflict(org.assertj.core.api.ThrowableAssert.ThrowingCallable operation) {
        assertThatThrownBy(operation).isInstanceOf(ApiException.class).satisfies(error -> assertThat(((ApiException)error).getStatus().value()).isEqualTo(409));
    }
    @Test void backRowEntryKeepsScoreServerAndOrdinaryCountAndCoachSeesLibero() throws Exception {
        var entered = change(0,5,10);
        assertThat(entered.homeScore()).isZero(); assertThat(entered.awayScore()).isZero();
        assertThat(entered.substitutions().homeUsed()).isZero(); assertThat(entered.version()).isEqualTo(1);
        assertThat(entered.court().server().id()).isEqualTo(hp.getFirst());
        assertThat(entered.libero().active().getFirst().regular().id()).isEqualTo(hp.get(4));
        assertThat(entered.libero().active().getFirst().rotationPosition()).isEqualTo(5);
        assertThat(entered.substitutions().options()).noneMatch(option -> option.outgoing().id().equals(hp.get(4)));
        assertThat(play.get(match.getId()).firstSet().homeLineup().get(4).participant().id()).isEqualTo(hp.get(4));
        mvc.perform(get(path()+"/score").session(login(UserRole.COACH))).andExpect(status().isOk())
                .andExpect(jsonPath("$.libero.active[0].libero.jerseyNumber").value(10));
    }
    @Test void frontRowServerOrdinaryReserveOpponentAndUnregisteredEntriesAreRejected() {
        for(var request : List.of(request(0,1,10),request(0,2,10),request(0,3,10),request(0,4,10),request(0,7,10),request(0,5,7),
                new SubstituteRequest(UUID.randomUUID(),0,hp.get(4),ap.get(9)),new SubstituteRequest(UUID.randomUUID(),0,hp.get(4),UUID.randomUUID())))
            conflict(() -> service.add(match.getId(),setId,request));
        assertThat(replacements.count()).isZero();
    }
    @Test void receivingPositionOneMayBeCoveredAndRotatesToSixWithoutServing() {
        service.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),0,ap.getFirst(),ap.get(9)));
        var result = point(1,away);
        assertThat(result.libero().mustExit()).isFalse(); assertThat(result.court().server().id()).isEqualTo(ap.get(1));
        assertThat(result.libero().active().getFirst().rotationPosition()).isEqualTo(6);
    }
    @Test void realExitRequiresCompletedRallyAndReturnsOnlyCoveredPlayer() {
        change(0,5,10); conflict(() -> change(1,10,5)); point(1,home);
        conflict(() -> change(2,10,6)); conflict(() -> change(2,6,11));
        var exited = change(2,10,5);
        assertThat(exited.libero().active()).isEmpty(); assertThat(exited.substitutions().homeUsed()).isZero();
        assertThat(exited.court().homeLineup().get(4).participant().id()).isEqualTo(hp.get(4));
    }
    @Test void secondLiberoTakesOverSameCoveredPlayerAndOnlyOneLiberoIsOnCourt() {
        change(0,5,10); point(1,home); var switched = change(2,10,11);
        assertThat(switched.libero().active()).hasSize(1);
        assertThat(switched.libero().active().getFirst().regular().id()).isEqualTo(hp.get(4));
        assertThat(switched.court().homeLineup().stream().filter(row -> row.participant().isLibero()).count()).isEqualTo(1);
        point(3,home); assertThat(change(4,11,5).libero().active()).isEmpty();
    }
    @Test void rotationIntoFrontRequiresExitBeforeNextPointAndRestoresValidServer() {
        change(0,5,10); point(1,away); var rotated = point(2,home);
        assertThat(rotated.libero().mustExit()).isTrue(); assertThat(rotated.canRecord()).isFalse(); assertThat(rotated.court().server()).isNull();
        var option = rotated.libero().options().getFirst();
        assertThat(option.incoming()).hasSize(1); assertThat(option.incoming().getFirst().id()).isEqualTo(hp.get(4));
        assertThat(rotated.substitutions().options()).isEmpty(); conflict(() -> point(3,home));
        var exited = change(3,10,5);
        assertThat(exited.libero().mustExit()).isFalse(); assertThat(exited.canRecord()).isTrue();
        assertThat(exited.court().server().id()).isEqualTo(hp.get(1)); point(4,home);
    }
    @Test void pointUndoAndLiberoUndoFollowReverseEventOrder() {
        var first = point(0,away); UUID replacement = change(1,5,10).libero().undoableId();
        assertThat(state().canUndo()).isFalse();
        conflict(() -> scores.undo(match.getId(),setId,first.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),2)));
        var later = point(2,away); conflict(() -> undo(3,replacement));
        scores.undo(match.getId(),setId,later.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),3));
        undo(4,replacement);
        assertThat(scores.undo(match.getId(),setId,first.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),5)).homeScore()).isZero();
        assertThat(state().libero().active()).isEmpty();
    }
    @Test void undoingRotatingPointRestoresLegalBackRowLiberoWithoutAnotherReplacement() {
        change(0,5,10); point(1,away); var rotated = point(2,home);
        var restored = scores.undo(match.getId(),setId,rotated.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),3));
        assertThat(restored.libero().mustExit()).isFalse(); assertThat(restored.canRecord()).isTrue();
        assertThat(restored.libero().active().getFirst().rotationPosition()).isEqualTo(5);
        assertThat(restored.court().server().id()).isEqualTo(ap.get(1)); assertThat(replacements.count()).isEqualTo(1);
    }
    @Test void undoingRequiredExitRestoresPendingExitUntilTheRotatingPointIsAlsoUndone() {
        change(0,5,10); point(1,away); var rotated = point(2,home);
        var exited = change(3,10,5); var restored = undo(4,exited.libero().undoableId());
        assertThat(restored.libero().mustExit()).isTrue(); assertThat(restored.canRecord()).isFalse();
        scores.undo(match.getId(),setId,rotated.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),5));
        assertThat(state().libero().mustExit()).isFalse(); assertThat(state().libero().active().getFirst().rotationPosition()).isEqualTo(5);
    }
    @Test void activeLiberoIsDerivedFromFullHistoryEvenWhenEntryIsOlderThanVisibleTwentyRows() {
        change(0,5,10); point(1,home);
        for(int n=0;n<21;n++) {
            var switched = change(state().version(),10,11);
            undo(switched.version(),switched.libero().undoableId());
        }
        assertThat(state().libero().history()).hasSize(20);
        assertThat(state().libero().active().getFirst().libero().id()).isEqualTo(hp.get(9));
        assertThat(state().libero().active().getFirst().regular().id()).isEqualTo(hp.get(4));
        assertThat(state().substitutions().homeUsed()).isZero();
    }
    @Test void ordinaryAndLiberoCorrectionsShareOneChronologicalOrder() {
        UUID replacement = change(0,5,10).libero().undoableId();
        var sub = ordinary.add(match.getId(),setId,request(1,1,7));
        conflict(() -> undo(2,replacement));
        ordinary.undo(match.getId(),setId,sub.substitutions().undoableId(),new UndoPointRequest(UUID.randomUUID(),2));
        undo(3,replacement);
        var first = ordinary.add(match.getId(),setId,request(4,1,7));
        UUID next = change(5,5,10).libero().undoableId();
        conflict(() -> ordinary.undo(match.getId(),setId,first.substitutions().undoableId(),new UndoPointRequest(UUID.randomUUID(),6)));
        undo(6,next); assertThat(state().substitutions().undoableId()).isEqualTo(first.substitutions().undoableId());
    }
    @Test void liberoCanCoverAnOrdinaryReserveAndLaterReturnDoesNotOverwriteNewOrdinaryChange() {
        ordinary.add(match.getId(),setId,request(0,5,7)); change(1,7,10); point(2,home);
        change(3,10,7); ordinary.add(match.getId(),setId,request(4,7,5));
        assertThat(state().court().homeLineup().get(4).participant().id()).isEqualTo(hp.get(4));
        point(5,home); var next = change(6,5,11);
        assertThat(next.libero().active().getFirst().regular().id()).isEqualTo(hp.get(4));
        assertThat(next.substitutions().homeUsed()).isEqualTo(2);
    }
    @Test void moreThanSixLiberoReplacementsNeverConsumeOrdinaryLimit() {
        for(int n=0;n<8;n++) {
            change(state().version(),n%2==0 ? 5:10,n%2==0 ? 10:5);
            point(state().version(),home);
        }
        assertThat(replacements.count()).isEqualTo(8); assertThat(state().substitutions().homeUsed()).isZero();
    }
    @Test void sixOrdinarySubstitutionsDoNotPreventLiberoEntry() {
        for(int n=1;n<=3;n++) {
            ordinary.add(match.getId(),setId,request(state().version(),n,n+6)); point(state().version(),home);
            ordinary.add(match.getId(),setId,request(state().version(),n+6,n)); point(state().version(),home);
        }
        assertThat(change(state().version(),5,10).substitutions().homeUsed()).isEqualTo(6);
    }
    @Test void retriesAreIdempotentAndCancelledEntryIsNeverResurrected() {
        var input = request(0,5,10); var first = service.add(match.getId(),setId,input);
        assertThat(service.add(match.getId(),setId,input).version()).isEqualTo(1);
        conflict(() -> change(0,6,11));
        conflict(() -> service.add(match.getId(),setId,new SubstituteRequest(input.requestId(),0,hp.get(5),hp.get(9))));
        var undoRequest = new UndoPointRequest(UUID.randomUUID(),1);
        service.undo(match.getId(),setId,first.libero().undoableId(),undoRequest);
        assertThat(service.undo(match.getId(),setId,first.libero().undoableId(),undoRequest).version()).isEqualTo(2);
        assertThat(service.add(match.getId(),setId,input).libero().active()).isEmpty();
        assertThat(replacements.count()).isEqualTo(1); assertThat(state().libero().history().getFirst().cancelledAt()).isNotNull();
    }
    @Test void winningSetKeepsHistoricalLiberoAndNextSetStartsWithoutOne() {
        var request = request(0,5,10); service.add(match.getId(),setId,request);
        for(int n=0;n<25;n++) point(state().version(),home);
        assertThat(state().canFinish()).isTrue(); assertThat(state().libero().mustExit()).isFalse();
        assertThat(state().libero().options()).isEmpty(); conflict(() -> change(state().version(),10,5));
        var finished = play.finish(match.getId(),setId,new FinishSetRequest(UUID.randomUUID(),state().version()));
        var last = finished.sets().getLast();
        var next = play.startNext(match.getId(),new StartNextSetRequest(2,setId,last.scoreVersion(),0,hp.subList(0,6),ap.subList(0,6),away.getId()));
        assertThat(scores.get(match.getId(),next.currentSet().id()).libero().active()).isEmpty();
        assertThat(service.add(match.getId(),setId,request).libero().active()).hasSize(1);
        conflict(() -> change(state().version(),10,5));
    }
    @Test void roleCsrfValidationAndScopeProtectBothEndpoints() throws Exception {
        String body = mapper.writeValueAsString(request(0,5,10));
        mvc.perform(post(path()+"/libero-replacements").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        for(UserRole role:List.of(UserRole.COACH,UserRole.ADMIN))
            mvc.perform(post(path()+"/libero-replacements").session(login(role)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(post(path()+"/libero-replacements").session(session).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post(path()+"/libero-replacements").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        mvc.perform(post(path()+"/libero-replacements").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        UUID id = state().libero().undoableId();
        mvc.perform(post(path()+"/libero-replacements/"+id+"/undo").session(login(UserRole.COACH)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(new UndoPointRequest(UUID.randomUUID(),1)))).andExpect(status().isForbidden());
        assertThatThrownBy(() -> service.add(UUID.randomUUID(),setId,request(1,10,5))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.undo(match.getId(),setId,UUID.randomUUID(),new UndoPointRequest(UUID.randomUUID(),1))).isInstanceOf(ApiException.class);
    }
    @Test void databaseRejectsOpponentAsCoveredRegularPlayer() {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO volleyball.libero_replacements (id,set_id,match_id,team_id,outgoing_participant_id,incoming_participant_id,regular_participant_id,starting_position,request_id,expected_version,after_point_sequence,home_score,away_score,created_at) VALUES (?,?,?,?,?,?,?,5,?,0,0,0,0,now())",
                UUID.randomUUID(),setId,match.getId(),home.getId(),hp.get(4),hp.get(9),ap.get(4),UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class);
    }
    private List<Integer> concurrent(IntSupplier first,IntSupplier second) throws Exception {
        ExecutorService executor=Executors.newFixedThreadPool(2); CountDownLatch start=new CountDownLatch(1);
        java.util.function.Function<IntSupplier,Callable<Integer>> task=action -> () -> {
            if(!start.await(5,TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout");
            try { return action.getAsInt(); } catch(ApiException error) { return error.getStatus().value(); }
        };
        try { var a=executor.submit(task.apply(first)); var b=executor.submit(task.apply(second)); start.countDown();
            return List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
    }
    @Test void concurrentRetriesCreateOneReplacement() throws Exception {
        var request=request(0,5,10); IntSupplier operation=() -> { service.add(match.getId(),setId,request); return 200; };
        assertThat(concurrent(operation,operation)).containsExactly(200,200);
        assertThat(replacements.count()).isEqualTo(1); assertThat(state().version()).isEqualTo(1);
    }
    @Test void concurrentPointAndEntryCannotOverwriteEachOther() throws Exception {
        assertThat(concurrent(() -> { change(0,5,10); return 200; }, () -> { point(0,home); return 200; }))
                .containsExactlyInAnyOrder(200,409);
        assertThat(state().version()).isEqualTo(1);
    }
}
