package rs.stefanoluic.volleyball.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration(proxyBeanMethods = false)
public class PasswordConfiguration {

    @Bean
    public PasswordEncoder passwordEncoder() {
        // Argon2id: 19 MiB memory, two iterations, one parallel lane.
        return new Argon2PasswordEncoder(16, 32, 1, 19 * 1024, 2);
    }
}
