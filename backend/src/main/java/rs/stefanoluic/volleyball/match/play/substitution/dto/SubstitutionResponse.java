package rs.stefanoluic.volleyball.match.play.substitution.dto;

import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitution;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.time.Instant;
import java.util.UUID;

public record SubstitutionResponse(UUID id, UUID teamId, MatchPlayerResponse outgoing, MatchPlayerResponse incoming,
                                   int homeScore, int awayScore, Instant createdAt, Instant cancelledAt) {
    public static SubstitutionResponse from(SetSubstitution row) {
        return new SubstitutionResponse(row.getId(), row.getTeamId(), MatchPlayerResponse.from(row.getOutgoing()),
                MatchPlayerResponse.from(row.getIncoming()), row.getHomeScore(), row.getAwayScore(), row.getCreatedAt(), row.getCancelledAt());
    }
}
