package rs.stefanoluic.volleyball.match.statistics;

import rs.stefanoluic.volleyball.match.play.score.PointActionType;
import java.util.UUID;

public record PointTotals(UUID scoringTeamId, PointActionType actionType, UUID participantId, long total) {}
