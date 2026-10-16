package rs.stefanoluic.volleyball.match.play.substitution.dto;

import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.util.List;
import java.util.UUID;

public record SubstitutionOption(UUID teamId, int startingPosition, MatchPlayerResponse outgoing,
                                 List<MatchPlayerResponse> incoming) {}
