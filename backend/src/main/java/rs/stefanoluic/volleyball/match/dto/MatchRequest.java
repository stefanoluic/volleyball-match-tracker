package rs.stefanoluic.volleyball.match.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record MatchRequest(
        @NotNull(message = "Izaberite domaći tim.") UUID homeTeamId,
        @NotNull(message = "Izaberite gostujući tim.") UUID awayTeamId,
        @NotNull(message = "Unesite datum i vreme utakmice.") Instant scheduledAt) {}
