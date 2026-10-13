package rs.stefanoluic.volleyball.match.roster.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record MatchRosterRequest(
        @NotNull @Min(0) Integer version,
        @NotNull(message = "Navedite domaći sastav.") @Size(max = 99)
        List<@NotNull @Valid RosterPlayerRequest> homePlayers,
        @NotNull(message = "Navedite gostujući sastav.") @Size(max = 99)
        List<@NotNull @Valid RosterPlayerRequest> awayPlayers) {}
