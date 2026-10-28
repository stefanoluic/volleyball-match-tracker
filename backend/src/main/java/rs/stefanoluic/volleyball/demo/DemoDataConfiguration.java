package rs.stefanoluic.volleyball.demo;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import rs.stefanoluic.volleyball.match.MatchRepository;
import rs.stefanoluic.volleyball.match.roster.MatchRosterService;
import rs.stefanoluic.volleyball.player.PlayerRepository;
import rs.stefanoluic.volleyball.team.TeamRepository;
import rs.stefanoluic.volleyball.user.UserRepository;

@Configuration(proxyBeanMethods = false)
@Profile("demo")
@EnableConfigurationProperties(DemoDataProperties.class)
public class DemoDataConfiguration {
    @Bean
    public DemoDataInitializer demoDataInitializer(UserRepository users, TeamRepository teams,
            PlayerRepository players, MatchRepository matches, MatchRosterService rosters,
            PasswordEncoder encoder, JdbcTemplate jdbc, DemoDataProperties properties, Environment environment) {
        // Reject conflicting startup initializers before any ApplicationRunner can write data.
        if (environment.getProperty("app.bootstrap-admin.enabled", Boolean.class, false)) {
            throw new IllegalStateException("Disable administrator bootstrap when using the demo profile.");
        }
        String password = properties.password();
        if (password == null || password.isBlank() || password.length() < 8 || password.length() > 128) {
            // Do not put a rejected password into binding/validation error messages.
            throw new IllegalStateException("Demo password must contain 8 to 128 characters and not be blank.");
        }
        return new DemoDataInitializer(users, teams, players, matches, rosters, encoder, jdbc, properties);
    }
}
