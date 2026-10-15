package rs.stefanoluic.volleyball.match.play;

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
import rs.stefanoluic.volleyball.match.play.dto.*;
import rs.stefanoluic.volleyball.match.play.score.*;
import rs.stefanoluic.volleyball.match.play.score.dto.*;
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
class SetLifecycleIntegrationTest {
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
    @Autowired SetScoreService scoring;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private Match match;
    private Team home, away;
    private List<UUID> homeIds, awayIds;
    private MatchPreparationResponse started;
    private static final String PASSWORD = "TestOnly!Password";
    @BeforeEach void seed() {
        matches.deleteAll(); players.deleteAll(); teams.deleteAll(); users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad")); away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        match = matches.saveAndFlush(new Match(home, away, Instant.now()));
        homeIds = roster(home); awayIds = roster(away);
        for (UserRole role : UserRole.values()) users.saveAndFlush(new User("Test", "User", email(role), encoder.encode(PASSWORD), role, UserStatus.ACTIVE));
        started = play.start(match.getId(), new StartMatchRequest(0, homeIds.subList(0,6), awayIds.subList(0,6), home.getId()));
    }
    private List<UUID> roster(Team team) {
        List<UUID> ids = new ArrayList<>();
        for (int n=1; n<=8; n++) {
            Player p = players.saveAndFlush(new Player(team,"Marko","Marković",n,n==8 ? PlayerPosition.LIBERO : PlayerPosition.SETTER));
            ids.add(participants.saveAndFlush(new MatchPlayer(match,team,p,n==8)).getId());
        }
        return ids;
    }
    private String email(UserRole role) { return role.name().toLowerCase(Locale.ROOT)+"@example.com"; }
    private MockHttpSession login(UserRole role) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).param("email",email(role)).param("password",PASSWORD))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    private String path() { return "/api/matches/"+match.getId(); }
    private FinishSetRequest finishRequest(int version) { return new FinishSetRequest(UUID.randomUUID(),version); }
    private void score(UUID setId,int h,int a,int version) {
        jdbc.update("UPDATE volleyball.match_sets SET home_score=?,away_score=?,score_version=? WHERE id=?",h,a,version,setId);
    }
    private StartNextSetRequest next(MatchPreparationResponse state) {
        var previous = state.sets().getLast();
        UUID serving = previous.firstServingTeamId().equals(home.getId()) ? away.getId() : home.getId();
        return new StartNextSetRequest(previous.number()+1,previous.id(),previous.scoreVersion(),0,
                homeIds.subList(0,6),awayIds.subList(0,6),serving);
    }
    private org.springframework.test.web.servlet.ResultActions postJson(String suffix,MockHttpSession session,Object input) throws Exception {
        return mvc.perform(post(path()+suffix).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(input)));
    }
    private void conflict(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOf(ApiException.class).satisfies(error -> assertThat(((ApiException)error).getStatus().value()).isEqualTo(409));
    }
    @Test void unfinishedScoreCannotCloseAndDeuceNeedsTwoPointLead() throws Exception {
        UUID id=started.currentSet().id(); var session=login(UserRole.STATISTICIAN);
        for (int[] values : List.of(new int[]{24,0},new int[]{24,24},new int[]{25,24})) {
            score(id,values[0],values[1],0);
            postJson("/sets/"+id+"/finish",session,finishRequest(0)).andExpect(status().isConflict());
        }
        score(id,26,24,2);
        postJson("/sets/"+id+"/finish",session,finishRequest(2)).andExpect(status().isOk())
                .andExpect(jsonPath("$.homeSetsWon").value(1)).andExpect(jsonPath("$.currentSet").isEmpty())
                .andExpect(jsonPath("$.nextSetNumber").value(2)).andExpect(jsonPath("$.sets[0].finishedAt").isNotEmpty())
                .andExpect(jsonPath("$.sets[0].winnerTeamId").value(home.getId().toString()))
                .andExpect(jsonPath("$.roster.match.status").value("LIVE"));
    }
    @Test void winningPointStopsNewPointsButCanBeCorrectedBeforeConfirmation() {
        UUID id=started.currentSet().id(); score(id,24,23,0);
        var winning=scoring.add(match.getId(),id,new AddPointRequest(UUID.randomUUID(),0,home.getId()));
        assertThat(winning.canRecord()).isFalse(); assertThat(winning.canUndo()).isTrue(); assertThat(winning.canFinish()).isTrue();
        conflict(() -> scoring.add(match.getId(),id,new AddPointRequest(UUID.randomUUID(),1,away.getId())));
        var corrected=scoring.undo(match.getId(),id,winning.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),1));
        assertThat(corrected.homeScore()).isEqualTo(24); assertThat(corrected.canFinish()).isFalse(); assertThat(corrected.canRecord()).isTrue();
        conflict(() -> play.finish(match.getId(),id,finishRequest(2)));
    }
    @Test void staleFinishIsRejectedAndClosedSetRejectsCorrection() {
        UUID id=started.currentSet().id(); score(id,25,0,3);
        conflict(() -> play.finish(match.getId(),id,finishRequest(2)));
        var finished=play.finish(match.getId(),id,finishRequest(3));
        assertThat(finished.sets().getFirst().scoreVersion()).isEqualTo(4);
        conflict(() -> scoring.add(match.getId(),id,new AddPointRequest(UUID.randomUUID(),4,home.getId())));
        conflict(() -> scoring.undo(match.getId(),id,UUID.randomUUID(),new UndoPointRequest(UUID.randomUUID(),4)));
    }
    @Test void committedFinishCanBeReplayedAfterNextSetWithoutDoubleCounting() {
        UUID id=started.currentSet().id(); score(id,25,0,0); var request=finishRequest(0);
        var finished=play.finish(match.getId(),id,request);
        var second=play.startNext(match.getId(),next(finished));
        var replay=play.finish(match.getId(),id,request);
        assertThat(replay.homeSetsWon()).isEqualTo(1); assertThat(replay.currentSet().id()).isEqualTo(second.currentSet().id());
        conflict(() -> play.finish(match.getId(),id,finishRequest(0)));
        conflict(() -> play.finish(match.getId(),id,new FinishSetRequest(request.requestId(),1)));
    }
    @Test void nextSetRequiresFinishedLatestSetAndExactExpectedState() throws Exception {
        UUID id=started.currentSet().id();
        conflict(() -> play.startNext(match.getId(),new StartNextSetRequest(2,id,0,0,homeIds.subList(0,6),awayIds.subList(0,6),away.getId())));
        score(id,25,0,0); var finished=play.finish(match.getId(),id,finishRequest(0));
        var base=next(finished); var session=login(UserRole.STATISTICIAN);
        for (var invalid : List.of(
                new StartNextSetRequest(3,id,base.previousSetVersion(),0,base.homeLineup(),base.awayLineup(),away.getId()),
                new StartNextSetRequest(2,UUID.randomUUID(),base.previousSetVersion(),0,base.homeLineup(),base.awayLineup(),away.getId()),
                new StartNextSetRequest(2,id,0,0,base.homeLineup(),base.awayLineup(),away.getId()),
                new StartNextSetRequest(2,id,base.previousSetVersion(),1,base.homeLineup(),base.awayLineup(),away.getId()))) {
            postJson("/sets",session,invalid).andExpect(status().isConflict());
        }
        postJson("/sets",session,new StartNextSetRequest(2,id,base.previousSetVersion(),0,
                base.homeLineup(),base.awayLineup(),home.getId())).andExpect(status().isBadRequest());
        postJson("/sets",session,new StartNextSetRequest(2,id,base.previousSetVersion(),0,
                Collections.nCopies(6,homeIds.getFirst()),base.awayLineup(),away.getId())).andExpect(status().isBadRequest());
        postJson("/sets",session,new StartNextSetRequest(2,id,base.previousSetVersion(),0,
                homeIds.subList(2,8),base.awayLineup(),away.getId())).andExpect(status().isBadRequest());
        assertThat(sets.count()).isEqualTo(1);
    }
    @Test void nextSetStoresItsOwnLineupAtZeroAndAlternatesFirstServe() {
        UUID id=started.currentSet().id(); score(id,25,0,0);
        var finished=play.finish(match.getId(),id,finishRequest(0)); var base=next(finished);
        var second=play.startNext(match.getId(),new StartNextSetRequest(2,id,base.previousSetVersion(),0,
                homeIds.subList(1,7),awayIds.subList(0,6),away.getId()));
        assertThat(second.sets()).hasSize(2); assertThat(second.currentSet().number()).isEqualTo(2);
        assertThat(second.currentSet().homeScore()).isZero(); assertThat(second.currentSet().firstServingTeamId()).isEqualTo(away.getId());
        assertThat(second.currentSet().homeLineup().getFirst().participant().id()).isEqualTo(homeIds.get(1));
        assertThat(second.firstSet().homeLineup().getFirst().participant().id()).isEqualTo(homeIds.getFirst());
        var freshCourt = scoring.get(match.getId(), second.currentSet().id()).court();
        assertThat(freshCourt.servingTeamId()).isEqualTo(away.getId());
        assertThat(freshCourt.server().id()).isEqualTo(awayIds.getFirst());
        assertThat(freshCourt.homeLineup().getFirst().participant().id()).isEqualTo(homeIds.get(1));
        assertThat(freshCourt.awayLineup().getFirst().rotationPosition()).isEqualTo(1);
        assertThat(lineups.count()).isEqualTo(24); conflict(() -> play.startNext(match.getId(),base));
    }
    @Test void fullThreeZeroMatchUsesRecordedPointsAndFinishesOnThirdSet() {
        var state=started;
        for(int number=1;number<=3;number++) {
            var active=state.currentSet();
            for(int point=0;point<25;point++) scoring.add(match.getId(),active.id(),new AddPointRequest(UUID.randomUUID(),point,home.getId()));
            state=play.finish(match.getId(),active.id(),finishRequest(25));
            if(number<3) state=play.startNext(match.getId(),next(state));
        }
        assertThat(state.homeSetsWon()).isEqualTo(3); assertThat(state.awaySetsWon()).isZero();
        assertThat(state.roster().match().status()).isEqualTo(MatchStatus.FINISHED);
        assertThat(state.currentSet()).isNull(); assertThat(state.nextSetNumber()).isNull();
        var finalState=state; conflict(() -> play.startNext(match.getId(),next(finalState)));
        assertThat(sets.count()).isEqualTo(3);
    }
    @Test void twoTwoEnablesFifthSetWithNewTossAndFifteenPointTarget() {
        var state=started;
        for(int number=1;number<=4;number++) {
            var active=state.currentSet(); score(active.id(),number%2==1 ? 25:0,number%2==0 ? 25:0,0);
            state=play.finish(match.getId(),active.id(),finishRequest(0));
            if(number<4) state=play.startNext(match.getId(),next(state));
        }
        assertThat(state.homeSetsWon()).isEqualTo(2); assertThat(state.awaySetsWon()).isEqualTo(2); assertThat(state.nextSetNumber()).isEqualTo(5);
        var base=next(state);
        state=play.startNext(match.getId(),new StartNextSetRequest(5,base.previousSetId(),base.previousSetVersion(),0,
                base.homeLineup(),base.awayLineup(),away.getId()));
        UUID fifth=state.currentSet().id();
        assertThat(state.currentSet().firstServingTeamId()).isEqualTo(away.getId());
        assertThat(scoring.get(match.getId(), fifth).court().servingTeamId()).isEqualTo(away.getId());
        assertThat(scoring.get(match.getId(), fifth).court().server().id()).isEqualTo(awayIds.getFirst());
        score(fifth,15,14,0); conflict(() -> play.finish(match.getId(),fifth,finishRequest(0)));
        score(fifth,16,14,1); state=play.finish(match.getId(),fifth,finishRequest(1));
        assertThat(state.roster().match().status()).isEqualTo(MatchStatus.FINISHED);
        assertThat(state.homeSetsWon()).isEqualTo(3); assertThat(state.awaySetsWon()).isEqualTo(2);
        assertThat(state.sets()).hasSize(5); assertThat(state.nextSetNumber()).isNull();
    }
    @Test void roleCsrfAndScopeChecksApplyToLifecycleEndpoints() throws Exception {
        UUID id=started.currentSet().id(); score(id,25,0,0); var request=finishRequest(0);
        mvc.perform(post(path()+"/sets/"+id+"/finish").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(request))).andExpect(status().isUnauthorized());
        var coach=login(UserRole.COACH); postJson("/sets/"+id+"/finish",coach,request).andExpect(status().isForbidden());
        postJson("/sets",coach,new StartNextSetRequest(2,id,0,0,homeIds.subList(0,6),awayIds.subList(0,6),away.getId())).andExpect(status().isForbidden());
        var admin=login(UserRole.ADMIN); postJson("/sets/"+id+"/finish",admin,request).andExpect(status().isForbidden());
        var statistician=login(UserRole.STATISTICIAN);
        mvc.perform(post(path()+"/sets/"+id+"/finish").session(statistician).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(request))).andExpect(status().isForbidden());
        postJson("/sets/"+UUID.randomUUID()+"/finish",statistician,request).andExpect(status().isNotFound());
        postJson("/sets/"+id+"/finish",statistician,Map.of()).andExpect(status().isBadRequest());
        postJson("/sets",statistician,Map.of("number",6)).andExpect(status().isBadRequest());
        mvc.perform(get(path()+"/preparation").session(coach)).andExpect(status().isOk()).andExpect(jsonPath("$.sets.length()").value(1));
    }
    @Test void databaseAllowsOnlyOneLiveSetPerMatch() {
        assertThatThrownBy(() -> sets.saveAndFlush(new MatchSet(match,2,away))).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(sets.count()).isEqualTo(1);
    }
    private List<Integer> concurrent(IntSupplier first,IntSupplier second) throws Exception {
        ExecutorService executor=Executors.newFixedThreadPool(2); CountDownLatch signal=new CountDownLatch(1);
        java.util.function.Function<IntSupplier,Callable<Integer>> task=operation -> () -> {
            if(!signal.await(5,TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout");
            try { return operation.getAsInt(); } catch(ApiException error) { return error.getStatus().value(); }
        };
        try { var a=executor.submit(task.apply(first)); var b=executor.submit(task.apply(second)); signal.countDown();
            return List.of(a.get(10,TimeUnit.SECONDS),b.get(10,TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
    }
    @Test void concurrentFinishRequestsCountWinOnlyOnceAndRetriesAreSafe() throws Exception {
        UUID id=started.currentSet().id(); score(id,25,0,0); var request=finishRequest(0);
        IntSupplier finish=() -> { play.finish(match.getId(),id,request); return 200; };
        assertThat(concurrent(finish,finish)).containsExactly(200,200);
        var state=play.get(match.getId()); assertThat(state.homeSetsWon()).isEqualTo(1);
        var nextRequest=next(state);
        IntSupplier start=() -> { play.startNext(match.getId(),nextRequest); return 200; };
        assertThat(concurrent(start,start)).containsExactlyInAnyOrder(200,409);
        assertThat(sets.count()).isEqualTo(2);
    }
    @Test void finishVersusWinningPointUndoHasOneWinnerAndNoMixedState() throws Exception {
        UUID id=started.currentSet().id(); score(id,24,23,0);
        UUID point=scoring.add(match.getId(),id,new AddPointRequest(UUID.randomUUID(),0,home.getId())).lastActivePoint().id();
        assertThat(concurrent(() -> { play.finish(match.getId(),id,finishRequest(1)); return 200; },
                () -> { scoring.undo(match.getId(),id,point,new UndoPointRequest(UUID.randomUUID(),1)); return 200; }))
                .containsExactlyInAnyOrder(200,409);
        var result=play.get(match.getId());
        if(result.homeSetsWon()==1) assertThat(result.sets().getFirst().homeScore()).isEqualTo(25);
        else { assertThat(result.currentSet().homeScore()).isEqualTo(24); assertThat(result.nextSetNumber()).isNull(); }
    }
}
