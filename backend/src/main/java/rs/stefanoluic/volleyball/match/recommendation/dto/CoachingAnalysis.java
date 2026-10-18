package rs.stefanoluic.volleyball.match.recommendation.dto;

import java.util.List;

public record CoachingAnalysis(AnalysisAvailability availability, long totalRallies, long unspecifiedRallies,
                               int minimumRallies, int minimumDetailCoveragePercent, List<TeamRecommendations> teams) {}
