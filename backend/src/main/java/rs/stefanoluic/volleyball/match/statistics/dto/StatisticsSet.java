package rs.stefanoluic.volleyball.match.statistics.dto;

import rs.stefanoluic.volleyball.match.play.MatchSet;
import rs.stefanoluic.volleyball.match.play.MatchSetStatus;
import java.util.UUID;

public record StatisticsSet(UUID id, int number, MatchSetStatus status, int scoreVersion) {
    public static StatisticsSet from(MatchSet set) {
        return new StatisticsSet(set.getId(), set.getNumber(), set.getStatus(), set.getScoreVersion());
    }
}
