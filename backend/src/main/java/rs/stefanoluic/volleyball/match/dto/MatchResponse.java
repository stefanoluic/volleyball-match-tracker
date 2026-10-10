package rs.stefanoluic.volleyball.match.dto;

import rs.stefanoluic.volleyball.match.Match;
import rs.stefanoluic.volleyball.match.MatchStatus;
import rs.stefanoluic.volleyball.team.dto.TeamResponse;
import java.time.Instant;
import java.util.UUID;

public record MatchResponse(UUID id, TeamResponse homeTeam, TeamResponse awayTeam,
                            Instant scheduledAt, MatchStatus status, Instant createdAt) {
    public static MatchResponse from(Match match) {
        return new MatchResponse(match.getId(), TeamResponse.from(match.getHomeTeam()),
                TeamResponse.from(match.getAwayTeam()), match.getScheduledAt(),
                match.getStatus(), match.getCreatedAt());
    }
}
