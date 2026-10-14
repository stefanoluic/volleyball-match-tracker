package rs.stefanoluic.volleyball.match.play.dto;

import rs.stefanoluic.volleyball.match.play.MatchSetStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MatchSetResponse(UUID id, int number, MatchSetStatus status, int homeScore, int awayScore,
                               UUID firstServingTeamId, Instant startedAt,
                               List<LineupPlayerResponse> homeLineup, List<LineupPlayerResponse> awayLineup) {}
