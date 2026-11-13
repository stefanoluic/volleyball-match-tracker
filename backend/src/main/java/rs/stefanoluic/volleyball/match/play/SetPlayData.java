package rs.stefanoluic.volleyball.match.play;

import rs.stefanoluic.volleyball.match.play.libero.LiberoReplacement;
import rs.stefanoluic.volleyball.match.play.score.SetPoint;
import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitution;
import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import java.util.List;

// Active events are ordered ascending. Build a new instance after each write; never cache across requests.
public record SetPlayData(List<SetLineup> starting, List<SetPoint> points,
                          List<SetSubstitution> substitutions, List<LiberoReplacement> liberos,
                          List<MatchPlayer> roster) {
    public SetPoint lastPoint() {
        return points.isEmpty() ? null : points.getLast();
    }
    public boolean hasChangeAfter(int version) {
        return substitutions.stream().anyMatch(row -> row.getExpectedVersion() > version)
                || liberos.stream().anyMatch(row -> row.getExpectedVersion() > version);
    }
    public boolean isLatestAction(int version) {
        return !hasChangeAfter(version) && points.stream().noneMatch(row -> row.getExpectedVersion() > version);
    }

    public MatchPlayer regularOccupant(SetLineup slot) {
        var last = lastSubstitution(slot);
        return last == null ? slot.getParticipant() : last.getIncoming();
    }

    public MatchPlayer currentOccupant(SetLineup slot) {
        var last = lastSubstitution(slot);
        var occupant = last == null ? slot.getParticipant() : last.getIncoming();
        int version = last == null ? -1 : last.getExpectedVersion();
        var teamId = slot.getParticipant().getTeam().getId();
        for (var change : liberos) {
            if (change.getTeamId().equals(teamId) && change.getStartingPosition() == slot.getRotationPosition()
                    && change.getExpectedVersion() > version) {
                occupant = change.getIncoming();
                version = change.getExpectedVersion();
            }
        }
        return occupant;
    }

    private SetSubstitution lastSubstitution(SetLineup slot) {
        SetSubstitution last = null;
        var teamId = slot.getParticipant().getTeam().getId();
        for (var change : substitutions) {
            if (change.getTeamId().equals(teamId) && change.getStartingPosition() == slot.getRotationPosition()) {
                last = change;
            }
        }
        return last;
    }
}
