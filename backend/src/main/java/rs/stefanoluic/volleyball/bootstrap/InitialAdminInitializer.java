package rs.stefanoluic.volleyball.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.user.User;
import rs.stefanoluic.volleyball.user.UserRepository;
import rs.stefanoluic.volleyball.user.UserRole;
import rs.stefanoluic.volleyball.user.UserStatus;

public class InitialAdminInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(InitialAdminInitializer.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AdminBootstrapProperties properties;

    public InitialAdminInitializer(UserRepository users, PasswordEncoder passwordEncoder,
                                   AdminBootstrapProperties properties) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String email = User.normalizeEmail(properties.email());
        var existing = users.findByEmail(email);
        if (existing.isPresent()) {
            User user = existing.get();
            if (user.getRole() != UserRole.ADMIN || user.getStatus() != UserStatus.ACTIVE) {
                throw new IllegalStateException(
                        "Bootstrap email is already assigned to a non-active-admin account.");
            }
            log.info("Initial administrator already exists; no account changes made.");
            return;
        }

        if (users.existsByRole(UserRole.ADMIN)) {
            log.info("An administrator already exists; initial administrator creation skipped.");
            return;
        }

        User admin = new User("System", "Administrator", email,
                passwordEncoder.encode(properties.password()), UserRole.ADMIN, UserStatus.ACTIVE);
        users.saveAndFlush(admin);
        log.info("Initial administrator created.");
    }
}
