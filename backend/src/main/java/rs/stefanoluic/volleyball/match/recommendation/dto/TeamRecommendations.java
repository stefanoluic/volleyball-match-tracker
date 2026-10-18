package rs.stefanoluic.volleyball.match.recommendation.dto;

import java.util.List;
import java.util.UUID;

public record TeamRecommendations(UUID teamId, String name, List<CoachingRecommendation> items) {}
