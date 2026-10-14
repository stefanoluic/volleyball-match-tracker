package rs.stefanoluic.volleyball.match.play.dto;

import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public record StartMatchRequest(
        @NotNull @Min(0) Integer rosterVersion,
        @NotNull @Size(min = 6, max = 6, message = "Izaberite šest domaćih igrača.")
        List<@NotNull UUID> homeLineup,
        @NotNull @Size(min = 6, max = 6, message = "Izaberite šest gostujućih igrača.")
        List<@NotNull UUID> awayLineup,
        @NotNull(message = "Izaberite tim koji prvi servira.") UUID firstServingTeamId) {}
