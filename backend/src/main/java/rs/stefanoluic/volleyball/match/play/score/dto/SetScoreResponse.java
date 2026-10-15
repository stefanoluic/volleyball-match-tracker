package rs.stefanoluic.volleyball.match.play.score.dto;

import rs.stefanoluic.volleyball.match.MatchStatus;
import rs.stefanoluic.volleyball.match.play.MatchSetStatus;
import java.util.List;
import java.util.UUID;

public record SetScoreResponse(UUID setId, int version, int homeScore, int awayScore,
                               MatchStatus matchStatus, MatchSetStatus setStatus, boolean canRecord,
                               PointResponse lastActivePoint, List<PointResponse> points,
                               boolean canUndo, boolean canFinish, UUID winnerTeamId, SetCourtResponse court) {}
