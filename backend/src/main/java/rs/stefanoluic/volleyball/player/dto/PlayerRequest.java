package rs.stefanoluic.volleyball.player.dto;

import jakarta.validation.constraints.*;
import rs.stefanoluic.volleyball.player.PlayerPosition;
import rs.stefanoluic.volleyball.team.Team;

public record PlayerRequest(
        @NotBlank(message = "Unesite ime.")
        @Size(max = 100, message = "Najviše 100 znakova.")
        @Pattern(regexp = "\\p{L}+(?:[ -]\\p{L}+)*",
                message = "Ime može da sadrži slova, uz razmak ili crticu između delova.")
        String firstName,
        @NotBlank(message = "Unesite prezime.")
        @Size(max = 100, message = "Najviše 100 znakova.")
        @Pattern(regexp = "\\p{L}+(?:[ -]\\p{L}+)*",
                message = "Prezime može da sadrži slova, uz razmak ili crticu između delova.")
        String lastName,
        @NotNull(message = "Unesite broj dresa.")
        @Min(value = 1, message = "Broj dresa mora biti između 1 i 99.")
        @Max(value = 99, message = "Broj dresa mora biti između 1 i 99.")
        Integer jerseyNumber,
        @NotNull(message = "Izaberite poziciju.")
        PlayerPosition position
) {
    public PlayerRequest {
        firstName = Team.normalizeText(firstName);
        lastName = Team.normalizeText(lastName);
    }
}
