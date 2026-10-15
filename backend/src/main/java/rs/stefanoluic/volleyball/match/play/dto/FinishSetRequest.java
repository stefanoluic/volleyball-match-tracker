package rs.stefanoluic.volleyball.match.play.dto;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record FinishSetRequest(@NotNull UUID requestId, @NotNull @Min(0) Integer version) {}
