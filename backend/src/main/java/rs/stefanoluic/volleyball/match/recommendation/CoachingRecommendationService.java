package rs.stefanoluic.volleyball.match.recommendation;

import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.match.recommendation.dto.*;
import rs.stefanoluic.volleyball.match.statistics.dto.TeamStatistics;
import java.util.ArrayList;
import java.util.List;

@Service
public class CoachingRecommendationService {
    // Application heuristics, not official volleyball rules or validated performance cut-offs.
    private static final int MINIMUM_RALLIES = 10;
    private static final int MINIMUM_DETAIL_COVERAGE = 80;

    public CoachingAnalysis analyze(TeamStatistics home, TeamStatistics away) {
        long total = home.totalPoints() + away.totalPoints();
        long unspecified = home.unspecifiedPoints() + away.unspecifiedPoints();
        var availability = total < MINIMUM_RALLIES ? AnalysisAvailability.INSUFFICIENT_DATA
                : unspecified * 100 > total * (100 - MINIMUM_DETAIL_COVERAGE) ? AnalysisAvailability.INCOMPLETE_DETAILS
                : AnalysisAvailability.AVAILABLE;
        boolean available = availability == AnalysisAvailability.AVAILABLE;
        return new CoachingAnalysis(availability, total, unspecified, MINIMUM_RALLIES, MINIMUM_DETAIL_COVERAGE,
                List.of(new TeamRecommendations(home.teamId(), home.name(), available ? evaluate(home, away) : List.of()),
                        new TeamRecommendations(away.teamId(), away.name(), available ? evaluate(away, home) : List.of())));
    }

    private List<CoachingRecommendation> evaluate(TeamStatistics team, TeamStatistics opponent) {
        var items = new ArrayList<CoachingRecommendation>();
        if (team.errors() >= 5 && team.errors() * 10 >= opponent.totalPoints() * 3) {
            items.add(new CoachingRecommendation(RecommendationCode.RECORDED_ERRORS, "Pregled zabeleženih grešaka",
                    team.errors() + " od " + opponent.totalPoints() + " protivničkih poena potiče od zabeleženih grešaka ovog tima.",
                    "Pregledajte te završne akcije pre taktičke odluke. Ovo nije stopa grešaka svih pokušaja niti ocena pojedinca.", null));
        }
        if (opponent.serviceAces() >= 3) {
            items.add(new CoachingRecommendation(RecommendationCode.OPPONENT_ACES, "Pregled protivničkih asova",
                    "Protivnik je u izabranom opsegu osvojio " + opponent.serviceAces() + " poena servis-asom.",
                    "Pregledajte te servise i raspored prijema. Bez podataka o prijemima ne može se odrediti odgovornost pojedinog igrača.", null));
        }
        long individualPoints = team.attackPoints() + team.blockPoints() + team.serviceAces();
        if (individualPoints >= 8) {
            team.players().stream().filter(player -> player.scoringPoints() >= 5
                    && player.scoringPoints() * 5 >= individualPoints * 3).findFirst().ifPresent(player -> {
                var participant = player.participant();
                items.add(new CoachingRecommendation(RecommendationCode.CONCENTRATED_SCORING, "Raspodela osvojenih poena",
                        "#" + participant.jerseyNumber() + " " + participant.firstName() + " " + participant.lastName()
                                + " ima " + player.scoringPoints() + " od " + individualPoints + " poena ovog tima iz napada, bloka i asa.",
                        "Uporedite raspodelu sa planom igre i pregledajte završne akcije. Sam broj poena ne pokazuje efikasnost napada i nije razlog za automatsku izmenu.",
                        participant.id()));
            });
        }
        return List.copyOf(items);
    }
}
