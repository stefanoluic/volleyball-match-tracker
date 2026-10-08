package rs.stefanoluic.volleyball.bootstrap;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import rs.stefanoluic.volleyball.user.UserRepository;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.bootstrap-admin.enabled", havingValue = "true")
@EnableConfigurationProperties(AdminBootstrapProperties.class)
public class AdminBootstrapConfiguration {

    @Bean
    public InitialAdminInitializer initialAdminInitializer(
            UserRepository users, PasswordEncoder passwordEncoder,
            AdminBootstrapProperties properties) {
        // Validate without including the rejected secret in configuration error reports.
        String password = properties.password();
        if (password == null || password.isBlank() || password.length() < 8 || password.length() > 128) {
            throw new IllegalStateException(
                    "Bootstrap administrator password must contain 8 to 128 characters and not be blank.");
        }
        return new InitialAdminInitializer(users, passwordEncoder, properties);
    }
}
