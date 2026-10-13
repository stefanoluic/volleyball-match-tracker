package rs.stefanoluic.volleyball.match.roster.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record RosterPlayerRequest(
        @NotNull(message = "Izaberite igrača.") UUID playerId,
        @NotNull(message = "Navedite da li je igrač libero.") Boolean isLibero) {}
