package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.match.play.MatchSet;
import rs.stefanoluic.volleyball.match.play.SetLineup;
import rs.stefanoluic.volleyball.match.play.SetLineupRepository;
import rs.stefanoluic.volleyball.match.play.dto.LineupPlayerResponse;
import rs.stefanoluic.volleyball.match.play.score.dto.SetCourtResponse;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class SetCourtService {
    private final SetLineupRepository lineups;
    private final SetPointRepository points;

    public SetCourtService(SetLineupRepository lineups, SetPointRepository points) {
        this.lineups = lineups;
        this.points = points;
    }

    public SetCourtResponse get(MatchSet set, boolean nextServeAvailable) {
        UUID homeId = set.getMatch().getHomeTeam().getId();
        UUID awayId = set.getMatch().getAwayTeam().getId();
        List<SetLineup> starting = lineups.findBySetIdOrderByRotationPositionAsc(set.getId());
        // Legacy/imported sets without complete starting sixes must not invent a server.
        if (starting.size() != 12) return null;
        var rallies = points.findBySetIdAndCancelledAtIsNullOrderBySequenceNumberAsc(set.getId());
        var homePoints = rallies.stream().map(point -> point.getScoringTeam().getId().equals(homeId)).toList();
        long homeScore = homePoints.stream().filter(Boolean::booleanValue).count();
        if (homeScore != set.getHomeScore() || homePoints.size() - homeScore != set.getAwayScore()) return null;
        var rotation = SetRotation.replay(set.getFirstServingTeam().getId().equals(homeId), set.getTargetScore(),
                homePoints);
        var home = rotate(starting, homeId, true, rotation);
        var away = rotate(starting, awayId, false, rotation);
        if (home.size() != 6 || away.size() != 6) return null;
        var serving = rotation.homeServing() ? home : away;
        return new SetCourtResponse(nextServeAvailable ? (rotation.homeServing() ? homeId : awayId) : null,
                nextServeAvailable ? serving.getFirst().participant() : null, home, away);
    }

    private List<LineupPlayerResponse> rotate(List<SetLineup> starting, UUID teamId, boolean home, SetRotation rotation) {
        return starting.stream().filter(row -> row.getParticipant().getTeam().getId().equals(teamId))
                .map(row -> new LineupPlayerResponse(rotation.position(row.getRotationPosition(), home),
                        MatchPlayerResponse.from(row.getParticipant())))
                .sorted(Comparator.comparingInt(LineupPlayerResponse::rotationPosition)).toList();
    }
}
