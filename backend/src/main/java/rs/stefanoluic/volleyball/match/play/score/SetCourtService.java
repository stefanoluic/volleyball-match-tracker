package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.match.play.MatchSet;
import rs.stefanoluic.volleyball.match.play.SetPlayData;
import rs.stefanoluic.volleyball.match.play.dto.LineupPlayerResponse;
import rs.stefanoluic.volleyball.match.play.score.dto.SetCourtResponse;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class SetCourtService {
    public SetCourtResponse get(MatchSet set, boolean nextServeAvailable, SetPlayData data) {
        UUID homeId = set.getMatch().getHomeTeam().getId();
        UUID awayId = set.getMatch().getAwayTeam().getId();
        var starting = data.starting();
        // Legacy/imported sets without complete starting sixes must not invent a server.
        if (starting.size() != 12) return null;
        var rallies = data.points();
        var homePoints = rallies.stream().map(point -> point.getScoringTeam().getId().equals(homeId)).toList();
        long homeScore = homePoints.stream().filter(Boolean::booleanValue).count();
        if (homeScore != set.getHomeScore() || homePoints.size() - homeScore != set.getAwayScore()) return null;
        var rotation = SetRotation.replay(set.getFirstServingTeam().getId().equals(homeId), set.getTargetScore(),
                homePoints);
        var home = rotate(data, homeId, true, rotation);
        var away = rotate(data, awayId, false, rotation);
        if (home.size() != 6 || away.size() != 6) return null;
        var serving = rotation.homeServing() ? home : away;
        return new SetCourtResponse(nextServeAvailable ? (rotation.homeServing() ? homeId : awayId) : null,
                nextServeAvailable && !serving.getFirst().participant().isLibero() ? serving.getFirst().participant() : null, home, away);
    }

    private List<LineupPlayerResponse> rotate(SetPlayData data, UUID teamId, boolean home, SetRotation rotation) {
        var players = new ArrayList<LineupPlayerResponse>();
        for (var slot : data.starting()) {
            if (slot.getParticipant().getTeam().getId().equals(teamId)) {
                players.add(new LineupPlayerResponse(rotation.position(slot.getRotationPosition(), home),
                        MatchPlayerResponse.from(data.currentOccupant(slot))));
            }
        }
        players.sort(Comparator.comparingInt(LineupPlayerResponse::rotationPosition));
        return players;
    }
}
