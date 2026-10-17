package rs.stefanoluic.volleyball.match.play.score.dto;

import jakarta.validation.constraints.*;
import rs.stefanoluic.volleyball.match.play.score.PointActionType;
import java.util.UUID;

public record AddPointRequest(@NotNull UUID requestId, @NotNull @Min(0) Integer version,
                              @NotNull(message = "Izaberite tim kome pripada poen.") UUID scoringTeamId,
                              PointActionType actionType, UUID participantId) {
    public AddPointRequest {
        if (actionType == null) actionType = PointActionType.UNSPECIFIED;
    }
    public AddPointRequest(UUID requestId, Integer version, UUID scoringTeamId) {
        this(requestId, version, scoringTeamId, PointActionType.UNSPECIFIED, null);
    }
}
