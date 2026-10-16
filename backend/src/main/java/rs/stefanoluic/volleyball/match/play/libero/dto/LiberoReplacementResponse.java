package rs.stefanoluic.volleyball.match.play.libero.dto;

import rs.stefanoluic.volleyball.match.play.libero.LiberoReplacement;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.time.Instant;
import java.util.UUID;

public record LiberoReplacementResponse(UUID id, UUID teamId, MatchPlayerResponse outgoing, MatchPlayerResponse incoming,
                                        int homeScore, int awayScore, Instant createdAt, Instant cancelledAt) {
    public static LiberoReplacementResponse from(LiberoReplacement row) {
        return new LiberoReplacementResponse(row.getId(), row.getTeamId(), MatchPlayerResponse.from(row.getOutgoing()),
                MatchPlayerResponse.from(row.getIncoming()), row.getHomeScore(), row.getAwayScore(), row.getCreatedAt(), row.getCancelledAt());
    }
}
