package rs.stefanoluic.volleyball.match.play.dto;

import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public record StartNextSetRequest(
        @NotNull @Min(2) @Max(5) Integer number,
        @NotNull UUID previousSetId,
        @NotNull @Min(0) Integer previousSetVersion,
        @NotNull @Min(0) Integer rosterVersion,
        @NotNull @Size(min = 6, max = 6, message = "Izaberite šest domaćih igrača.") List<@NotNull UUID> homeLineup,
        @NotNull @Size(min = 6, max = 6, message = "Izaberite šest gostujućih igrača.") List<@NotNull UUID> awayLineup,
        @NotNull UUID firstServingTeamId) {
    public StartMatchRequest lineup() {
        return new StartMatchRequest(rosterVersion, homeLineup, awayLineup, firstServingTeamId);
    }
}
