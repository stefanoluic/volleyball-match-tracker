package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.match.play.MatchSet;
import rs.stefanoluic.volleyball.match.play.SetLineup;
import rs.stefanoluic.volleyball.match.play.SetPlayData;
import rs.stefanoluic.volleyball.match.play.dto.LineupPlayerResponse;
import rs.stefanoluic.volleyball.match.play.score.dto.SetCourtResponse;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitution;
import rs.stefanoluic.volleyball.match.play.libero.LiberoReplacement;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class SetCourtService {
    public SetCourtResponse get(MatchSet set, boolean nextServeAvailable, SetPlayData data) {
        UUID homeId = set.getMatch().getHomeTeam().getId();
        UUID awayId = set.getMatch().getAwayTeam().getId();
        List<SetLineup> starting = data.starting();
        // Legacy/imported sets without complete starting sixes must not invent a server.
        if (starting.size() != 12) return null;
        var rallies = data.points();
        var homePoints = rallies.stream().map(point -> point.getScoringTeam().getId().equals(homeId)).toList();
        long homeScore = homePoints.stream().filter(Boolean::booleanValue).count();
        if (homeScore != set.getHomeScore() || homePoints.size() - homeScore != set.getAwayScore()) return null;
        var rotation = SetRotation.replay(set.getFirstServingTeam().getId().equals(homeId), set.getTargetScore(),
                homePoints);
        var changes = data.substitutions();
        var liberoChanges = data.liberos();
        var home = rotate(starting, homeId, true, rotation, changes, liberoChanges);
        var away = rotate(starting, awayId, false, rotation, changes, liberoChanges);
        if (home.size() != 6 || away.size() != 6) return null;
        var serving = rotation.homeServing() ? home : away;
        return new SetCourtResponse(nextServeAvailable ? (rotation.homeServing() ? homeId : awayId) : null,
                nextServeAvailable && !serving.getFirst().participant().isLibero() ? serving.getFirst().participant() : null, home, away);
    }

    private List<LineupPlayerResponse> rotate(List<SetLineup> starting, UUID teamId, boolean home, SetRotation rotation,
                                             List<SetSubstitution> changes, List<LiberoReplacement> liberoChanges) {
        return starting.stream().filter(row -> row.getParticipant().getTeam().getId().equals(teamId))
                .map(row -> {
                    var occupant = row.getParticipant();
                    int version = -1;
                    for (var change : changes) if (change.getTeamId().equals(teamId)
                            && change.getStartingPosition() == row.getRotationPosition()) {
                        occupant = change.getIncoming(); version = change.getExpectedVersion();
                    }
                    for (var change : liberoChanges) if (change.getTeamId().equals(teamId)
                            && change.getStartingPosition() == row.getRotationPosition() && change.getExpectedVersion() > version) {
                        occupant = change.getIncoming(); version = change.getExpectedVersion();
                    }
                    return new LineupPlayerResponse(rotation.position(row.getRotationPosition(), home), MatchPlayerResponse.from(occupant));
                })
                .sorted(Comparator.comparingInt(LineupPlayerResponse::rotationPosition)).toList();
    }
}
