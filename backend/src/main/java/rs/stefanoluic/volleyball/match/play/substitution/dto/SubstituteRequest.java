package rs.stefanoluic.volleyball.match.play.substitution.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record SubstituteRequest(@NotNull UUID requestId, @NotNull @Min(0) Integer version,
                                @NotNull UUID outgoingParticipantId, @NotNull UUID incomingParticipantId) {}
