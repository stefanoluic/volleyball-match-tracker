package rs.stefanoluic.volleyball.match.play.score;

import java.util.List;

/** Rotational order derived from rallies; substitutions and libero replacements are not modeled. */
public record SetRotation(boolean homeServing, int homeTurns, int awayTurns) {
    public static SetRotation replay(boolean homeServesFirst, int targetScore, List<Boolean> homePoints) {
        boolean serving = homeServesFirst;
        int home = 0, away = 0, homeTurns = 0, awayTurns = 0;
        for (boolean homePoint : homePoints) {
            if (homePoint) home++; else away++;
            boolean winningScore = Math.max(home, away) >= targetScore && Math.abs(home - away) >= 2;
            // There is no next service/rotation after a set-winning rally.
            if (homePoint != serving && !winningScore) {
                if (homePoint) homeTurns = (homeTurns + 1) % 6;
                else awayTurns = (awayTurns + 1) % 6;
            }
            serving = homePoint;
        }
        return new SetRotation(serving, homeTurns, awayTurns);
    }

    public int position(int startingPosition, boolean home) {
        if (startingPosition < 1 || startingPosition > 6) throw new IllegalArgumentException("Invalid rotation position.");
        return Math.floorMod(startingPosition - 1 - (home ? homeTurns : awayTurns), 6) + 1;
    }
}
