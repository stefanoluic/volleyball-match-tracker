package rs.stefanoluic.volleyball.match.statistics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
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
import rs.stefanoluic.volleyball.match.play.libero.LiberoReplacementService;
import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitutionService;
import rs.stefanoluic.volleyball.match.play.substitution.dto.SubstituteRequest;
import rs.stefanoluic.volleyball.match.roster.*;
import rs.stefanoluic.volleyball.match.statistics.dto.*;
import rs.stefanoluic.volleyball.player.*;
import rs.stefanoluic.volleyball.team.*;
import rs.stefanoluic.volleyball.user.*;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "app.bootstrap-admin.enabled=false"})
@AutoConfigureMockMvc @Testcontainers
class MatchStatisticsIntegrationTest {
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
    @Autowired SetPointRepository points;
    @Autowired SetSubstitutionService substitutions;
    @Autowired LiberoReplacementService liberos;
    @Autowired MatchStatisticsService statistics;
    @Autowired JdbcTemplate jdbc;
    private Match match;
    private Team home, away;
    private List<UUID> hp, ap;
    private UUID setId;

    @BeforeEach void seed() {
        matches.deleteAll(); players.deleteAll(); teams.deleteAll(); users.deleteAll();
        home=teams.saveAndFlush(new Team("Vojvodina","Novi Sad"));
        away=teams.saveAndFlush(new Team("Partizan","Beograd"));
        match=matches.saveAndFlush(new Match(home,away,Instant.now())); hp=roster(home); ap=roster(away);
        setId=play.start(match.getId(),new StartMatchRequest(0,hp.subList(0,6),ap.subList(0,6),home.getId())).currentSet().id();
    }
    private List<UUID> roster(Team team) {
        var ids=new ArrayList<UUID>();
        for(int n=1;n<=8;n++) {
            var player=players.saveAndFlush(new Player(team,"Marko","Marković",n,n==8 ? PlayerPosition.LIBERO : PlayerPosition.SETTER));
            ids.add(participants.saveAndFlush(new MatchPlayer(match,team,player,n==8)).getId());
        }
        return ids;
    }
    private SetScoreResponse point(Team team, PointActionType type, UUID participant) {
        int version=sets.findById(setId).orElseThrow().getScoreVersion();
        return scores.add(match.getId(),setId,new AddPointRequest(UUID.randomUUID(),version,team.getId(),type,participant));
    }
    private MatchStatisticsResponse all() { return statistics.get(match.getId(),null); }
    private PlayerStatistics player(TeamStatistics team, UUID id) {
        return team.players().stream().filter(row -> row.participant().id().equals(id)).findFirst().orElseThrow();
    }
    private void assertTotals(TeamStatistics team) {
        assertThat(team.totalPoints()).isEqualTo(team.attackPoints()+team.blockPoints()+team.serviceAces()+team.opponentErrors()+team.unspecifiedPoints());
        assertThat(team.players().stream().mapToLong(PlayerStatistics::scoringPoints).sum())
                .isEqualTo(team.attackPoints()+team.blockPoints()+team.serviceAces());
        assertThat(team.players().stream().mapToLong(PlayerStatistics::errors).sum()+team.unattributedErrors()).isEqualTo(team.errors());
    }
    private MockHttpSession login(UserRole role, UserStatus status) throws Exception {
        users.saveAndFlush(new User("Test","User",role.name()+"@example.com",encoder.encode("TestOnly!Password"),role,UserStatus.ACTIVE));
        var session=(MockHttpSession)mvc.perform(post("/api/auth/login").with(csrf()).param("email",role.name()+"@example.com")
                .param("password","TestOnly!Password")).andExpect(status().isOk()).andReturn().getRequest().getSession(false);
        if(status!=UserStatus.ACTIVE) jdbc.update("UPDATE volleyball.users SET status=? WHERE email=?",status.name(),role.name().toLowerCase(Locale.ROOT)+"@example.com");
        return session;
    }
    private String path() { return "/api/matches/"+match.getId()+"/statistics"; }

    @Test void emptyMatchHasZerosForBothTeamsAndEveryRegisteredPlayerIncludingBenchAndLibero() {
        var result=all();
        assertThat(result.setId()).isNull(); assertThat(result.sets()).hasSize(1);
        assertThat(result.home().totalPoints()).isZero(); assertThat(result.away().totalPoints()).isZero();
        assertThat(result.home().players()).hasSize(8); assertThat(result.away().players()).hasSize(8);
        assertThat(result.home().players()).extracting(row -> row.participant().jerseyNumber()).containsExactly(1,2,3,4,5,6,7,8);
        assertThat(player(result.home(),hp.get(7)).participant().isLibero()).isTrue();
        assertTotals(result.home()); assertTotals(result.away());
    }
    @Test void everyCategoryHasCorrectTeamAndPlayerTotalsWithoutCreditingOpponentErrorsAsIndividualPoints() {
        point(home,PointActionType.ATTACK,hp.get(2));
        point(home,PointActionType.BLOCK,hp.get(2));
        point(home,PointActionType.SERVICE_ACE,hp.getFirst());
        point(home,PointActionType.OPPONENT_ERROR,ap.get(3));
        point(home,PointActionType.OPPONENT_ERROR,null);
        point(home,PointActionType.UNSPECIFIED,null);
        point(away,PointActionType.ATTACK,ap.get(1));
        point(away,PointActionType.OPPONENT_ERROR,hp.get(2));
        var result=all(); var h=result.home(); var a=result.away();
        assertThat(h.totalPoints()).isEqualTo(6); assertThat(a.totalPoints()).isEqualTo(2);
        assertThat(h.attackPoints()).isEqualTo(1); assertThat(h.blockPoints()).isEqualTo(1); assertThat(h.serviceAces()).isEqualTo(1);
        assertThat(h.opponentErrors()).isEqualTo(2); assertThat(h.unspecifiedPoints()).isEqualTo(1);
        assertThat(a.errors()).isEqualTo(2); assertThat(a.unattributedErrors()).isEqualTo(1); assertThat(h.errors()).isEqualTo(1);
        assertThat(player(h,hp.get(2)).scoringPoints()).isEqualTo(2); assertThat(player(h,hp.get(2)).errors()).isEqualTo(1);
        assertThat(player(a,ap.get(3)).scoringPoints()).isZero(); assertThat(player(a,ap.get(3)).errors()).isEqualTo(1);
        assertTotals(h); assertTotals(a);
    }
    @Test void scoreOnlyPointsWithNullParticipantAreNotLostByGrouping() {
        for(int i=0;i<24;i++) point(home,PointActionType.UNSPECIFIED,null);
        var result=all();
        assertThat(result.home().totalPoints()).isEqualTo(24); assertThat(result.home().unspecifiedPoints()).isEqualTo(24);
        assertThat(result.home().players()).allSatisfy(row -> assertThat(row.scoringPoints()).isZero());
        assertThat(scores.get(match.getId(),setId).points()).hasSize(20);
        assertTotals(result.home());
    }
    @Test void cancelledPointsDisappearFromAggregatesButRemainInHistoryAndRetryDoesNotResurrectThem() {
        var input=new AddPointRequest(UUID.randomUUID(),0,home.getId(),PointActionType.ATTACK,hp.getFirst());
        var added=scores.add(match.getId(),setId,input);
        scores.undo(match.getId(),setId,added.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),1));
        scores.add(match.getId(),setId,input);
        assertThat(all().home().totalPoints()).isZero(); assertThat(player(all().home(),hp.getFirst()).scoringPoints()).isZero();
        assertThat(scores.get(match.getId(),setId).points().getFirst().cancelledAt()).isNotNull();
        point(home,PointActionType.ATTACK,hp.getFirst());
        assertThat(all().home().totalPoints()).isEqualTo(1); assertThat(player(all().home(),hp.getFirst()).scoringPoints()).isEqualTo(1);
    }
    @Test void undoOfAnErrorRemovesBothWinnerPointAndOpposingPlayerError() {
        var result=point(home,PointActionType.OPPONENT_ERROR,ap.get(2));
        scores.undo(match.getId(),setId,result.lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),1));
        var statistics=all(); assertThat(statistics.home().opponentErrors()).isZero(); assertThat(statistics.away().errors()).isZero();
        assertThat(player(statistics.away(),ap.get(2)).errors()).isZero();
    }
    @Test void aggregateCoversCompletedAndLiveSetsWhileEachSetRemainsIndependent() {
        UUID first=setId;
        for(int i=0;i<25;i++) point(home,PointActionType.ATTACK,hp.get(2));
        play.finish(match.getId(),setId,new FinishSetRequest(UUID.randomUUID(),25));
        setId=play.startNext(match.getId(),new StartNextSetRequest(2,first,26,0,hp.subList(0,6),ap.subList(0,6),away.getId())).currentSet().id();
        point(away,PointActionType.SERVICE_ACE,ap.getFirst());
        var total=all(); var firstStats=statistics.get(match.getId(),first); var second=statistics.get(match.getId(),setId);
        assertThat(total.home().totalPoints()).isEqualTo(25); assertThat(total.away().totalPoints()).isEqualTo(1);
        assertThat(firstStats.home().totalPoints()).isEqualTo(25); assertThat(firstStats.away().totalPoints()).isZero();
        assertThat(second.home().totalPoints()).isZero(); assertThat(second.away().serviceAces()).isEqualTo(1);
        assertThat(total.sets()).extracting(StatisticsSet::number).containsExactly(1,2);
        assertThat(total.sets()).extracting(StatisticsSet::scoreVersion).containsExactly(26,1);
        assertThat(total.home().totalPoints()).isEqualTo(firstStats.home().totalPoints()+second.home().totalPoints());
        assertTotals(total.home()); assertTotals(total.away());
    }
    @Test void threeSetFinishedMatchKeepsReadableTotalsWithoutInventingRates() throws Exception {
        for(int number=1;number<=3;number++) {
            UUID current=setId;
            for(int i=0;i<25;i++) point(home,PointActionType.ATTACK,hp.get(2));
            var finished=play.finish(match.getId(),setId,new FinishSetRequest(UUID.randomUUID(),25));
            if(number<3) setId=play.startNext(match.getId(),new StartNextSetRequest(number+1,current,26,0,
                    hp.subList(0,6),ap.subList(0,6),number==1 ? away.getId() : home.getId())).currentSet().id();
            else assertThat(finished.roster().match().status()).isEqualTo(MatchStatus.FINISHED);
        }
        var result=all(); assertThat(result.matchStatus()).isEqualTo(MatchStatus.FINISHED);
        assertThat(result.home().totalPoints()).isEqualTo(75); assertThat(player(result.home(),hp.get(2)).scoringPoints()).isEqualTo(75);
        mvc.perform(get(path()).session(login(UserRole.COACH,UserStatus.ACTIVE))).andExpect(status().isOk())
                .andExpect(jsonPath("$.home.totalPoints").value(75)).andExpect(jsonPath("$.home.attackSuccessRate").doesNotExist());
    }
    @Test void statisticsDoNotMixAnotherMatchEvenWhenTeamsAreTheSame() {
        point(home,PointActionType.ATTACK,hp.get(2));
        var other=matches.saveAndFlush(new Match(home,away,Instant.now())); other.start(); other=matches.saveAndFlush(other);
        var otherSet=sets.saveAndFlush(new MatchSet(other,1,home));
        scores.add(other.getId(),otherSet.getId(),new AddPointRequest(UUID.randomUUID(),0,away.getId()));
        assertThat(all().home().totalPoints()).isEqualTo(1); assertThat(all().away().totalPoints()).isZero();
        assertThat(statistics.get(other.getId(),null).away().totalPoints()).isEqualTo(1);
    }
    @Test void scheduledMatchAndEmptyRosterAreReadableAsEmptyStatistics() {
        var scheduled=matches.saveAndFlush(new Match(home,away,Instant.now()));
        var result=statistics.get(scheduled.getId(),null);
        assertThat(result.sets()).isEmpty(); assertThat(result.home().players()).isEmpty(); assertThat(result.home().totalPoints()).isZero();
    }
    @Test void snapshotNamesNumbersAndMatchParticipantIdsAreUsedInsteadOfCurrentPlayerData() {
        point(home,PointActionType.ATTACK,hp.get(2));
        UUID playerId=participants.findById(hp.get(2)).orElseThrow().getPlayer().getId();
        jdbc.update("UPDATE volleyball.players SET first_name='Petar',jersey_number=30 WHERE id=?",playerId);
        var row=player(all().home(),hp.get(2));
        assertThat(row.participant().firstName()).isEqualTo("Marko"); assertThat(row.participant().jerseyNumber()).isEqualTo(3);
        assertThat(row.participant().id()).isNotEqualTo(playerId); assertThat(row.scoringPoints()).isEqualTo(1);
    }
    @Test void substitutesAndLiberoHaveSeparateRowsAndChangesAloneNeverCountAsPoints() {
        substitutions.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),0,hp.getFirst(),hp.get(6)));
        assertThat(all().home().totalPoints()).isZero();
        point(home,PointActionType.SERVICE_ACE,hp.get(6));
        liberos.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),2,hp.get(4),hp.get(7)));
        point(away,PointActionType.OPPONENT_ERROR,hp.get(7));
        var result=all(); assertThat(player(result.home(),hp.getFirst()).scoringPoints()).isZero();
        assertThat(player(result.home(),hp.get(6)).serviceAces()).isEqualTo(1);
        assertThat(player(result.home(),hp.get(7)).errors()).isEqualTo(1);
        assertThat(result.home().totalPoints()).isEqualTo(1); assertThat(result.away().totalPoints()).isEqualTo(1);
        assertTotals(result.home()); assertTotals(result.away());
    }
    @Test void completedRetryDoesNotDoubleCount() {
        var input=new AddPointRequest(UUID.randomUUID(),0,home.getId(),PointActionType.ATTACK,hp.get(2));
        scores.add(match.getId(),setId,input); scores.add(match.getId(),setId,input);
        assertThat(all().home().totalPoints()).isEqualTo(1); assertThat(player(all().home(),hp.get(2)).attackPoints()).isEqualTo(1);
    }
    @Test void onlyActiveStatisticiansAndCoachesCanReadAndNoMutationEndpointIsExposed() throws Exception {
        mvc.perform(get(path())).andExpect(status().isUnauthorized());
        mvc.perform(get(path()).session(login(UserRole.ADMIN,UserStatus.ACTIVE))).andExpect(status().isForbidden());
        var coach=login(UserRole.COACH,UserStatus.ACTIVE);
        mvc.perform(get(path()).session(coach)).andExpect(status().isOk());
        mvc.perform(post(path()).session(coach).with(csrf())).andExpect(status().isForbidden());
        var statistician=login(UserRole.STATISTICIAN,UserStatus.ACTIVE);
        mvc.perform(get(path()).session(statistician)).andExpect(status().isOk());
        mvc.perform(post(path()).session(statistician).with(csrf())).andExpect(status().isMethodNotAllowed());
        assertThat(points.count()).isZero();
    }
    @Test void blockedSessionLosesAccessToStatistics() throws Exception {
        mvc.perform(get(path()).session(login(UserRole.COACH,UserStatus.BLOCKED))).andExpect(status().isUnauthorized());
    }
    @Test void matchAndSetScopeAndMalformedIdentifiersAreChecked() throws Exception {
        var session=login(UserRole.COACH,UserStatus.ACTIVE);
        var other=matches.saveAndFlush(new Match(home,away,Instant.now()));
        UUID otherSet=sets.saveAndFlush(new MatchSet(other,1,home)).getId();
        for(UUID wrong : List.of(UUID.randomUUID(),otherSet)) {
            mvc.perform(get(path()).param("setId",wrong.toString()).session(session)).andExpect(status().isNotFound());
            assertThatThrownBy(() -> statistics.get(match.getId(),wrong)).isInstanceOf(ApiException.class);
        }
        mvc.perform(get(path()).param("setId","wrong").session(session)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/matches/"+UUID.randomUUID()+"/statistics").session(session)).andExpect(status().isNotFound());
        mvc.perform(get(path()).param("setId",setId.toString()).session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.setId").value(setId.toString()));
    }
}
