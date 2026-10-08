package rs.stefanoluic.volleyball.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import rs.stefanoluic.volleyball.user.User;

import java.text.Normalizer;

public record RegisterRequest(
        @NotBlank(message = "Unesite ime.") @Size(max = 100, message = "Najviše 100 znakova.")
        @Pattern(regexp = "\\p{L}+(?:[ -]\\p{L}+)*",
                message = "Ime može da sadrži slova, uz razmak ili crticu između delova.") String firstName,
        @NotBlank(message = "Unesite prezime.") @Size(max = 100, message = "Najviše 100 znakova.")
        @Pattern(regexp = "\\p{L}+(?:[ -]\\p{L}+)*",
                message = "Prezime može da sadrži slova, uz razmak ili crticu između delova.") String lastName,
        @NotBlank(message = "Unesite mejl.") @Email(message = "Unesite ispravnu mejl adresu.")
        @Pattern(regexp = "[^\\s@]+@[^\\s@.]+(?:\\.[^\\s@.]+)+",
                message = "Unesite ispravnu mejl adresu, npr. ime@primer.com.")
        @Size(max = 254, message = "Mejl je predugačak.") String email,
        @NotBlank(message = "Unesite lozinku.")
        @Size(min = 8, max = 128, message = "Lozinka mora imati od 8 do 128 znakova.") String password,
        @NotBlank(message = "Potvrdite lozinku.")
        @Size(max = 128, message = "Potvrda lozinke je predugačka.") String confirmPassword,
        @NotNull(message = "Izaberite ulogu.") RegistrationRole role) {
    public RegisterRequest {
        firstName = firstName == null ? null : Normalizer.normalize(firstName.strip(), Normalizer.Form.NFC);
        lastName = lastName == null ? null : Normalizer.normalize(lastName.strip(), Normalizer.Form.NFC);
        email = email == null ? null : User.normalizeEmail(email);
    }
    @Override public String toString() {
        return "RegisterRequest[email=" + email + ", role=" + role + ", passwords=[REDACTED]]";
    }
}
