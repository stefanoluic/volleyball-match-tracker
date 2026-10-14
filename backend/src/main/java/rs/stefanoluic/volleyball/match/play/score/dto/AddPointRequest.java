package rs.stefanoluic.volleyball.match.play.score.dto;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record AddPointRequest(@NotNull UUID requestId, @NotNull @Min(0) Integer version,
                              @NotNull(message = "Izaberite tim kome pripada poen.") UUID scoringTeamId) {}
