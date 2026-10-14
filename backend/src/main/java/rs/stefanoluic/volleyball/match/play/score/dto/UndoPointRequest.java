package rs.stefanoluic.volleyball.match.play.score.dto;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record UndoPointRequest(@NotNull UUID requestId, @NotNull @Min(0) Integer version) {}
