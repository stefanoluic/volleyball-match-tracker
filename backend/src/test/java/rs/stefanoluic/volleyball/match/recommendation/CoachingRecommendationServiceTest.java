package rs.stefanoluic.volleyball.match.recommendation;

import org.junit.jupiter.api.Test;
import rs.stefanoluic.volleyball.match.recommendation.dto.*;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import rs.stefanoluic.volleyball.match.statistics.dto.*;
import rs.stefanoluic.volleyball.player.PlayerPosition;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class CoachingRecommendationServiceTest {
    private final CoachingRecommendationService service = new CoachingRecommendationService();
    private final UUID home = UUID.randomUUID(), away = UUID.randomUUID();

    // Scoring contains each player's attack + ace points. Team errors are left unattributed.
    private TeamStatistics team(UUID id, long[] scoring, long aces, long opponentErrors, long unknown, long errors) {
        var players = new ArrayList<PlayerStatistics>();
        for (int i=0;i<scoring.length;i++) {
            var participant = new MatchPlayerResponse(UUID.randomUUID(),UUID.randomUUID(),id,"Marko","Marković",i+1,PlayerPosition.SETTER,false);
            players.add(new PlayerStatistics(participant,scoring[i]-(i==0 ? aces : 0),0,i==0 ? aces : 0,scoring[i],0));
        }
        long individual = Arrays.stream(scoring).sum();
        return new TeamStatistics(id,id.equals(home) ? "Vojvodina" : "Partizan",individual+opponentErrors+unknown,
                individual-aces,0,aces,opponentErrors,unknown,errors,errors,players);
    }
    private TeamStatistics h(long... scoring) { return team(home,scoring,0,0,0,0); }
    private TeamStatistics a(long... scoring) { return team(away,scoring,0,0,0,0); }
    private List<RecommendationCode> codes(CoachingAnalysis result,int index) {
        return result.teams().get(index).items().stream().map(CoachingRecommendation::code).toList();
    }
    private void noItems(CoachingAnalysis result) { assertThat(result.teams()).allSatisfy(team -> assertThat(team.items()).isEmpty()); }

    @Test void emptyAndNineRalliesDoNotGenerateAdvice() {
        for (var result : List.of(service.analyze(h(),a()),service.analyze(h(3,2),a(2,2)))) {
            assertThat(result.availability()).isEqualTo(AnalysisAvailability.INSUFFICIENT_DATA); noItems(result);
        }
    }
    @Test void tenRalliesAndExactlyEightyPercentCoverageAreEnough() {
        var result=service.analyze(team(home,new long[]{2,2},0,0,2,0),a(2,2));
        assertThat(result.totalRallies()).isEqualTo(10); assertThat(result.unspecifiedRallies()).isEqualTo(2);
        assertThat(result.availability()).isEqualTo(AnalysisAvailability.AVAILABLE);
    }
    @Test void missingDetailsSuppressAllRulesEvenWhenAnApparentPatternPassesThresholds() {
        var result=service.analyze(team(home,new long[]{10},0,0,3,0),a());
        assertThat(result.availability()).isEqualTo(AnalysisAvailability.INCOMPLETE_DETAILS); noItems(result);
        var allUnknown=service.analyze(team(home,new long[]{},0,0,10,0),a());
        assertThat(allUnknown.availability()).isEqualTo(AnalysisAvailability.INCOMPLETE_DETAILS); noItems(allUnknown);
    }
    @Test void errorRuleNeedsBothFiveErrorsAndThirtyPercentOfOpponentsPoints() {
        var belowCount=service.analyze(team(home,new long[]{2,2,2},0,0,0,4),team(away,new long[]{2,2,2},0,4,0,0));
        assertThat(codes(belowCount,0)).doesNotContain(RecommendationCode.RECORDED_ERRORS);
        var belowShare=service.analyze(team(home,new long[]{2,2,2},0,0,0,5),team(away,new long[]{4,4,4},0,5,0,0));
        assertThat(codes(belowShare,0)).doesNotContain(RecommendationCode.RECORDED_ERRORS);
        var boundary=service.analyze(team(home,new long[]{2,2,2},0,0,0,6),team(away,new long[]{5,5,4},0,6,0,0));
        assertThat(codes(boundary,0)).contains(RecommendationCode.RECORDED_ERRORS);
        assertThat(boundary.teams().getFirst().items().getFirst().observation()).contains("6 od 20");
        assertThat(codes(boundary,1)).doesNotContain(RecommendationCode.RECORDED_ERRORS);
    }
    @Test void opponentAcesAreFlaggedForTheReceivingTeamOnlyAtThree() {
        var below=service.analyze(h(2,2,2),team(away,new long[]{2,2},2,0,0,0));
        assertThat(codes(below,0)).doesNotContain(RecommendationCode.OPPONENT_ACES);
        var result=service.analyze(h(2,2,2),team(away,new long[]{3,2},3,0,0,0));
        assertThat(codes(result,0)).contains(RecommendationCode.OPPONENT_ACES);
        assertThat(codes(result,1)).doesNotContain(RecommendationCode.OPPONENT_ACES);
        assertThat(result.teams().getFirst().items().getFirst().observation()).contains("3 poena servis-asom");
    }
    @Test void concentrationNeedsEightIndividualPointsFiveFromPlayerAndSixtyPercentShare() {
        assertThat(codes(service.analyze(h(5,2),a(2,2)),0)).doesNotContain(RecommendationCode.CONCENTRATED_SCORING);
        assertThat(codes(service.analyze(h(4,4),a(2,2)),0)).doesNotContain(RecommendationCode.CONCENTRATED_SCORING);
        assertThat(codes(service.analyze(h(6,5),a(2,2)),0)).doesNotContain(RecommendationCode.CONCENTRATED_SCORING);
        assertThat(codes(service.analyze(h(5,3),a(2,2)),0)).contains(RecommendationCode.CONCENTRATED_SCORING);
        assertThat(codes(service.analyze(h(6,4),a(2,2)),0)).contains(RecommendationCode.CONCENTRATED_SCORING);
    }
    @Test void concentrationExcludesPointsGiftedByOpponentsAndUsesSavedPlayerIdentity() {
        var team=team(home,new long[]{6,4},0,10,0,0);
        var result=service.analyze(team,a(2,2));
        var item=result.teams().getFirst().items().stream().filter(row -> row.code()==RecommendationCode.CONCENTRATED_SCORING).findFirst().orElseThrow();
        assertThat(item.observation()).contains("6 od 10", "#1 Marko Marković");
        assertThat(item.participantId()).isEqualTo(team.players().getFirst().participant().id());
        assertThat(item.suggestion()).contains("nije razlog za automatsku izmenu");
    }
    @Test void tiedScorersDoNotSelectAnArbitraryLeader() {
        assertThat(codes(service.analyze(h(5,5),a(2,2)),0)).doesNotContain(RecommendationCode.CONCENTRATED_SCORING);
    }
    @Test void enoughDataWithNoPatternIsNotAnInsufficientDataState() {
        var result=service.analyze(h(2,2,2),a(2,2,2));
        assertThat(result.availability()).isEqualTo(AnalysisAvailability.AVAILABLE); noItems(result);
    }
    @Test void outputIsDeterministicAndReadOnlyAndCanContainAllThreeRulesInStableOrder() {
        var team=team(home,new long[]{6,4},0,0,0,5);
        var opponent=team(away,new long[]{3,2},3,5,0,0);
        var result=service.analyze(team,opponent);
        assertThat(codes(result,0)).containsExactly(RecommendationCode.RECORDED_ERRORS,RecommendationCode.OPPONENT_ACES,RecommendationCode.CONCENTRATED_SCORING);
        assertThat(service.analyze(team,opponent)).isEqualTo(result);
        assertThatThrownBy(() -> result.teams().getFirst().items().clear()).isInstanceOf(UnsupportedOperationException.class);
    }
}
