package rs.stefanoluic.volleyball.match.statistics.dto;

import rs.stefanoluic.volleyball.match.MatchStatus;
import java.util.List;
import java.util.UUID;

public record MatchStatisticsResponse(UUID matchId, UUID setId, MatchStatus matchStatus,
                                      List<StatisticsSet> sets, TeamStatistics home, TeamStatistics away) {}
