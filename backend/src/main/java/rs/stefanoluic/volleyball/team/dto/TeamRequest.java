package rs.stefanoluic.volleyball.team.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import rs.stefanoluic.volleyball.team.Team;

public record TeamRequest(
        @NotBlank(message = "Unesite naziv tima.")
        @Size(max = 100, message = "Naziv može imati najviše 100 znakova.") String name,
        @NotBlank(message = "Unesite grad.")
        @Size(max = 100, message = "Grad može imati najviše 100 znakova.") String city) {
    public TeamRequest {
        name = Team.normalizeText(name);
        city = Team.normalizeText(city);
    }
}
