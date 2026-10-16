package rs.stefanoluic.volleyball.match.play.libero.dto;

import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.util.List;
import java.util.UUID;

public record LiberoOption(UUID teamId, int startingPosition, UUID regularParticipantId,
                           MatchPlayerResponse outgoing, List<MatchPlayerResponse> incoming) {}
