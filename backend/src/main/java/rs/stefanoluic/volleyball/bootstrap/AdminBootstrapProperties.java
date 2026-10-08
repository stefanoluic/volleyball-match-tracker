package rs.stefanoluic.volleyball.bootstrap;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "app.bootstrap-admin")
public record AdminBootstrapProperties(
        @NotBlank @Email @Size(max = 254) String email,
        String password) {

    @Override
    public String toString() {
        return "AdminBootstrapProperties[email=" + email + ", password=[REDACTED]]";
    }
}
