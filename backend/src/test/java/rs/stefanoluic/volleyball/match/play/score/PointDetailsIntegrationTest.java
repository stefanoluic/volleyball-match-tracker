package rs.stefanoluic.volleyball.match.play.score;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
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
import rs.stefanoluic.volleyball.match.play.score.dto.*;
import rs.stefanoluic.volleyball.match.play.libero.LiberoReplacementService;
import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitutionService;
import rs.stefanoluic.volleyball.match.play.substitution.dto.SubstituteRequest;
import rs.stefanoluic.volleyball.match.roster.*;
import rs.stefanoluic.volleyball.player.*;
import rs.stefanoluic.volleyball.team.*;
import rs.stefanoluic.volleyball.user.*;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "app.bootstrap-admin.enabled=false"})
@AutoConfigureMockMvc @Testcontainers
class PointDetailsIntegrationTest {
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
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private Match match;
    private Team home, away;
    private List<UUID> hp, ap;
    private UUID setId;

    @BeforeEach void seed() {
        matches.deleteAll(); players.deleteAll(); teams.deleteAll(); users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad"));
        away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        match = matches.saveAndFlush(new Match(home, away, Instant.now()));
        hp = roster(home); ap = roster(away);
        setId = play.start(match.getId(), new StartMatchRequest(0, hp.subList(0,6), ap.subList(0,6), home.getId())).currentSet().id();
    }
    private List<UUID> roster(Team team) {
        var ids = new ArrayList<UUID>();
        for (int n=1; n<=8; n++) {
            var player = players.saveAndFlush(new Player(team,"Marko","Marković",n,n==8 ? PlayerPosition.LIBERO : PlayerPosition.SETTER));
            ids.add(participants.saveAndFlush(new MatchPlayer(match,team,player,n==8)).getId());
        }
        return ids;
    }
    private AddPointRequest request(int version, Team team, PointActionType type, UUID player) {
        return new AddPointRequest(UUID.randomUUID(), version, team.getId(), type, player);
    }
    private SetScoreResponse add(int version, Team team, PointActionType type, UUID player) {
        return scores.add(match.getId(), setId, request(version,team,type,player));
    }
    private SetScoreResponse state() { return scores.get(match.getId(),setId); }
    private void rejected(int status, org.assertj.core.api.ThrowableAssert.ThrowingCallable operation) {
        assertThatThrownBy(operation).isInstanceOf(ApiException.class).satisfies(error ->
                assertThat(((ApiException)error).getStatus().value()).isEqualTo(status));
    }
    private String path() { return "/api/matches/" + match.getId() + "/sets/" + setId; }
    private MockHttpSession login(UserRole role) throws Exception {
        users.saveAndFlush(new User("Test","User",role.name()+"@example.com",encoder.encode("TestOnly!Password"),role,UserStatus.ACTIVE));
        return (MockHttpSession)mvc.perform(post("/api/auth/login").with(csrf())
                .param("email",role.name()+"@example.com").param("password","TestOnly!Password"))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }

    @Test void attackStoresSnapshotParticipantAndAddsExactlyOnePoint() {
        var result = add(0,home,PointActionType.ATTACK,hp.get(3));
        assertThat(result.homeScore()).isEqualTo(1); assertThat(result.version()).isEqualTo(1);
        assertThat(result.lastActivePoint().actionType()).isEqualTo(PointActionType.ATTACK);
        assertThat(result.lastActivePoint().participant().id()).isEqualTo(hp.get(3));
        var original = participants.findById(hp.get(3)).orElseThrow().getPlayer();
        jdbc.update("UPDATE volleyball.players SET first_name='Petar',jersey_number=30 WHERE id=?", original.getId());
        assertThat(state().lastActivePoint().participant().firstName()).isEqualTo("Marko");
        assertThat(state().lastActivePoint().participant().jerseyNumber()).isEqualTo(4);
    }
    @Test void missingDetailsRemainUnspecifiedAndCannotContainAnActor() {
        var result = scores.add(match.getId(),setId,new AddPointRequest(UUID.randomUUID(),0,home.getId()));
        assertThat(result.lastActivePoint().actionType()).isEqualTo(PointActionType.UNSPECIFIED);
        assertThat(result.lastActivePoint().participant()).isNull();
        rejected(400, () -> add(1,home,PointActionType.UNSPECIFIED,hp.getFirst()));
    }
    @Test void attackAndBlockRequireAScoringPlayerActuallyOnCourt() {
        for (var type : List.of(PointActionType.ATTACK,PointActionType.BLOCK)) {
            for (UUID id : List.of(ap.get(2),hp.get(6),hp.get(7),UUID.randomUUID()))
                rejected(400, () -> add(0,home,type,id));
            rejected(400, () -> add(0,home,type,null));
        }
        assertThat(points.count()).isZero(); assertThat(state().version()).isZero();
    }
    @Test void opponentErrorsAttributeToOpposingPlayerOrNoIndividualNotTheScoringSide() {
        rejected(400, () -> add(0,home,PointActionType.OPPONENT_ERROR,hp.getFirst()));
        rejected(400, () -> add(0,home,PointActionType.OPPONENT_ERROR,ap.get(6)));
        var individual = add(0,home,PointActionType.OPPONENT_ERROR,ap.get(2));
        assertThat(individual.homeScore()).isEqualTo(1);
        assertThat(individual.lastActivePoint().participant().teamId()).isEqualTo(away.getId());
        var teamFault = add(1,away,PointActionType.OPPONENT_ERROR,null);
        assertThat(teamFault.awayScore()).isEqualTo(1); assertThat(teamFault.lastActivePoint().participant()).isNull();
    }
    @Test void aceRequiresCurrentServerAndUsesCourtBeforeSideOut() {
        rejected(400, () -> add(0,away,PointActionType.SERVICE_ACE,ap.getFirst()));
        rejected(400, () -> add(0,home,PointActionType.SERVICE_ACE,hp.get(1)));
        rejected(400, () -> add(0,home,PointActionType.SERVICE_ACE,null));
        add(0,home,PointActionType.SERVICE_ACE,hp.getFirst());
        add(1,away,PointActionType.ATTACK,ap.get(1));
        rejected(400, () -> add(2,away,PointActionType.SERVICE_ACE,ap.getFirst()));
        var result = add(2,away,PointActionType.SERVICE_ACE,ap.get(1));
        assertThat(result.lastActivePoint().participant().id()).isEqualTo(ap.get(1));
        assertThat(result.awayScore()).isEqualTo(2);
    }
    @Test void blockUsesFrontRowBeforeResultingRotationNotAfterIt() {
        rejected(400, () -> add(0,away,PointActionType.BLOCK,ap.getFirst()));
        // Position 2 is front-row for this rally, even though its winner rotates into position 1 afterwards.
        var result = add(0,away,PointActionType.BLOCK,ap.get(1));
        assertThat(result.court().server().id()).isEqualTo(ap.get(1));
        rejected(400, () -> add(1,away,PointActionType.BLOCK,ap.get(1)));
        add(1,away,PointActionType.BLOCK,ap.get(2));
    }
    @Test void ordinaryReplacementIsEligibleButOutgoingAndBenchPlayersAreNot() {
        substitutions.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),0,hp.getFirst(),hp.get(6)));
        rejected(400, () -> add(1,home,PointActionType.SERVICE_ACE,hp.getFirst()));
        var result = add(1,home,PointActionType.SERVICE_ACE,hp.get(6));
        assertThat(result.lastActivePoint().participant().jerseyNumber()).isEqualTo(7);
    }
    @Test void liberoCanBeAttributedAnErrorOrLegalLowAttackButNotABlockAndCoveredPlayerIsAbsent() {
        liberos.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),0,hp.get(4),hp.get(7)));
        rejected(400, () -> add(1,home,PointActionType.ATTACK,hp.get(4)));
        rejected(400, () -> add(1,home,PointActionType.BLOCK,hp.get(7)));
        add(1,home,PointActionType.ATTACK,hp.get(7));
        var result = add(2,away,PointActionType.OPPONENT_ERROR,hp.get(7));
        assertThat(result.lastActivePoint().participant().isLibero()).isTrue();
    }
    @Test void mandatoryLiberoExitStillBlocksEveryNewPointIncludingClassified() {
        liberos.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),0,ap.get(4),ap.get(7)));
        var result = add(1,away,PointActionType.ATTACK,ap.get(2));
        assertThat(result.libero().mustExit()).isTrue();
        rejected(409, () -> add(2,away,PointActionType.SERVICE_ACE,ap.get(1)));
        assertThat(state().awayScore()).isEqualTo(1);
    }
    @Test void idempotencyComparesDetailsAndRetriesDoNotRevalidateAgainstLaterRotations() {
        var input = request(0,away,PointActionType.BLOCK,ap.get(1));
        scores.add(match.getId(),setId,input);
        assertThat(scores.add(match.getId(),setId,input).awayScore()).isEqualTo(1);
        rejected(409, () -> scores.add(match.getId(),setId,new AddPointRequest(input.requestId(),0,away.getId(),PointActionType.ATTACK,ap.get(1))));
        rejected(409, () -> scores.add(match.getId(),setId,new AddPointRequest(input.requestId(),0,away.getId(),PointActionType.BLOCK,ap.get(2))));
        rejected(409, () -> scores.add(match.getId(),setId,new AddPointRequest(input.requestId(),0,away.getId())));
        var cancelled = scores.undo(match.getId(),setId,state().lastActivePoint().id(),new UndoPointRequest(UUID.randomUUID(),1));
        assertThat(cancelled.awayScore()).isZero();
        assertThat(cancelled.points().getFirst().actionType()).isEqualTo(PointActionType.BLOCK);
        assertThat(cancelled.points().getFirst().participant().id()).isEqualTo(ap.get(1));
        assertThat(scores.add(match.getId(),setId,input).awayScore()).isZero();
        assertThat(points.count()).isEqualTo(1);
    }
    @Test void staleDetailsDoNotRecordAfterAnInterveningSubstitution() {
        var old = request(0,home,PointActionType.ATTACK,hp.getFirst());
        substitutions.add(match.getId(),setId,new SubstituteRequest(UUID.randomUUID(),0,hp.getFirst(),hp.get(6)));
        rejected(409, () -> scores.add(match.getId(),setId,old));
        assertThat(points.count()).isZero();
    }
    @Test void aParticipantFromAnotherMatchCannotBeUsedEvenIfHisTeamMatches() {
        var other = matches.saveAndFlush(new Match(home,away,Instant.now()));
        var originalId = participants.findById(hp.getFirst()).orElseThrow().getPlayer().getId();
        var original = players.findById(originalId).orElseThrow();
        UUID otherId = participants.saveAndFlush(new MatchPlayer(other,home,original,false)).getId();
        rejected(400, () -> add(0,home,PointActionType.ATTACK,otherId));
        UUID pointId = add(0,home,PointActionType.ATTACK,hp.getFirst()).lastActivePoint().id();
        assertThatThrownBy(() -> jdbc.update("UPDATE volleyball.set_points SET participant_id=? WHERE id=?",otherId,pointId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
    @Test void winningPointCarriesDetailsAndFinishedSetKeepsHistoryButRejectsNewWrites() {
        for(int i=0;i<24;i++) add(i,home,PointActionType.UNSPECIFIED,null);
        var input = request(24,home,PointActionType.SERVICE_ACE,hp.getFirst());
        var result = scores.add(match.getId(),setId,input);
        assertThat(result.canFinish()).isTrue(); assertThat(result.lastActivePoint().actionType()).isEqualTo(PointActionType.SERVICE_ACE);
        rejected(409, () -> add(25,home,PointActionType.ATTACK,hp.getFirst()));
        play.finish(match.getId(),setId,new FinishSetRequest(UUID.randomUUID(),25));
        assertThat(scores.add(match.getId(),setId,input).homeScore()).isEqualTo(25);
        assertThat(state().lastActivePoint().participant().id()).isEqualTo(hp.getFirst());
        rejected(409, () -> add(26,home,PointActionType.ATTACK,hp.getFirst()));
    }
    @Test void scoreOnlyStillWorksWithoutLineupsButDetailsCannotInventAPlayer() {
        jdbc.update("DELETE FROM volleyball.set_lineups WHERE set_id=?",setId);
        rejected(409, () -> add(0,home,PointActionType.ATTACK,hp.getFirst()));
        assertThat(add(0,home,PointActionType.UNSPECIFIED,null).homeScore()).isEqualTo(1);
    }
    @Test void detailedHttpInputUsesExistingRoleAndCsrfProtectionAndCoachReadsSnapshots() throws Exception {
        var input = request(0,home,PointActionType.SERVICE_ACE,hp.getFirst());
        String json = mapper.writeValueAsString(input);
        mvc.perform(post(path()+"/points").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isUnauthorized());
        var coach = login(UserRole.COACH);
        mvc.perform(post(path()+"/points").session(coach).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
        var admin = login(UserRole.ADMIN);
        mvc.perform(post(path()+"/points").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
        var statistician = login(UserRole.STATISTICIAN);
        mvc.perform(post(path()+"/points").session(statistician).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
        mvc.perform(post(path()+"/points").session(statistician).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk()).andExpect(jsonPath("$.lastActivePoint.actionType").value("SERVICE_ACE"));
        mvc.perform(get(path()+"/score").session(coach)).andExpect(status().isOk())
                .andExpect(jsonPath("$.points[0].participant.jerseyNumber").value(1));
    }
    @Test void unknownTypeOrMalformedParticipantIsRejectedWithoutWriting() throws Exception {
        var statistician = login(UserRole.STATISTICIAN);
        var data = new HashMap<String,Object>(Map.of("requestId",UUID.randomUUID(),"version",0,"scoringTeamId",home.getId(),"actionType","UNKNOWN"));
        mvc.perform(post(path()+"/points").session(statistician).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                .andExpect(status().isBadRequest());
        data.put("actionType","ATTACK"); data.put("participantId","not-a-uuid");
        mvc.perform(post(path()+"/points").session(statistician).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                .andExpect(status().isBadRequest());
        assertThat(points.count()).isZero();
    }
    @Test void databaseProtectsDetailsAndMatchDeletionCascadesThem() {
        UUID id = add(0,home,PointActionType.ATTACK,hp.getFirst()).lastActivePoint().id();
        for (String assignment : List.of("action_type='UNKNOWN'", "action_type='UNSPECIFIED'", "participant_id=NULL", "participant_team_id=NULL"))
            assertThatThrownBy(() -> jdbc.update("UPDATE volleyball.set_points SET "+assignment+" WHERE id=?",id))
                    .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE volleyball.set_points SET participant_id=?,participant_team_id=? WHERE id=?",ap.getFirst(),away.getId(),id))
                .isInstanceOf(DataIntegrityViolationException.class);
        matches.deleteAll(); assertThat(points.count()).isZero(); assertThat(participants.count()).isZero();
    }
    @Test void migrationPreservesExistingPointsWithoutInventingHistoricalDetails() {
        // A second database in the disposable test container, never the development database.
        jdbc.execute("CREATE DATABASE point_details_upgrade");
        String url = "jdbc:postgresql://"+DATABASE.getHost()+":"+DATABASE.getMappedPort(5432)+"/point_details_upgrade";
        var source = new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword());
        Flyway.configure().dataSource(source).target("12").load().migrate();
        var old = new JdbcTemplate(source);
        UUID homeId=UUID.randomUUID(), awayId=UUID.randomUUID(), matchId=UUID.randomUUID(), oldSetId=UUID.randomUUID(), pointId=UUID.randomUUID();
        old.update("INSERT INTO volleyball.teams(id,name,city) VALUES (?,'Home','City'),(?,'Away','City')",homeId,awayId);
        old.update("INSERT INTO volleyball.matches(id,home_team_id,away_team_id,scheduled_at,status) VALUES (?,?,?,CURRENT_TIMESTAMP,'LIVE')",matchId,homeId,awayId);
        old.update("INSERT INTO volleyball.match_sets(id,match_id,set_number,status,home_score,first_serving_team_id,started_at,score_version,last_point_sequence) VALUES (?,?,1,'LIVE',1,?,CURRENT_TIMESTAMP,1,1)",oldSetId,matchId,homeId);
        old.update("INSERT INTO volleyball.set_points(id,set_id,scoring_team_id,sequence_number,request_id,expected_version,home_score_after,away_score_after,created_at) VALUES (?,?,?,1,?,0,1,0,CURRENT_TIMESTAMP)",pointId,oldSetId,homeId,UUID.randomUUID());
        Flyway.configure().dataSource(source).load().migrate();
        var migrated = old.queryForMap("SELECT match_id,action_type,participant_id,home_score_after,sequence_number FROM volleyball.set_points WHERE id=?",pointId);
        assertThat(migrated.get("match_id")).isEqualTo(matchId);
        assertThat(migrated.get("action_type")).isEqualTo("UNSPECIFIED");
        assertThat(migrated.get("participant_id")).isNull();
        assertThat(migrated.get("home_score_after")).isEqualTo(1);
        assertThat(migrated.get("sequence_number")).isEqualTo(1);
    }
}
