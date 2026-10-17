package rs.stefanoluic.volleyball.match.play.score.dto;

import rs.stefanoluic.volleyball.match.play.score.SetPoint;
import rs.stefanoluic.volleyball.match.play.score.PointActionType;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.time.Instant;
import java.util.UUID;

public record PointResponse(UUID id, int sequenceNumber, UUID scoringTeamId,
                            int homeScoreAfter, int awayScoreAfter, Instant createdAt, Instant cancelledAt,
                            PointActionType actionType, MatchPlayerResponse participant) {
    public static PointResponse from(SetPoint point) {
        return new PointResponse(point.getId(), point.getSequenceNumber(), point.getScoringTeam().getId(),
                point.getHomeScoreAfter(), point.getAwayScoreAfter(), point.getCreatedAt(), point.getCancelledAt(),
                point.getActionType(), point.getParticipant() == null ? null : MatchPlayerResponse.from(point.getParticipant()));
    }
}
