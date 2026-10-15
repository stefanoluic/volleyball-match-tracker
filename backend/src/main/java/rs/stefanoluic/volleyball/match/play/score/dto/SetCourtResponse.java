package rs.stefanoluic.volleyball.match.play.score.dto;

import rs.stefanoluic.volleyball.match.play.dto.LineupPlayerResponse;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.util.List;
import java.util.UUID;

public record SetCourtResponse(UUID servingTeamId, MatchPlayerResponse server,
                               List<LineupPlayerResponse> homeLineup, List<LineupPlayerResponse> awayLineup) {}
