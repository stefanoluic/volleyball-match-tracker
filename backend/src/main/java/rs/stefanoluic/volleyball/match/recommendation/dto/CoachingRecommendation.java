package rs.stefanoluic.volleyball.match.recommendation.dto;

import java.util.UUID;

public record CoachingRecommendation(RecommendationCode code, String title, String observation,
                                      String suggestion, UUID participantId) {}
