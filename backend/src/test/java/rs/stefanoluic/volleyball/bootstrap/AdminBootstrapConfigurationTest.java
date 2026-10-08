package rs.stefanoluic.volleyball.bootstrap;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import rs.stefanoluic.volleyball.user.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class AdminBootstrapConfigurationTest {

    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(AdminBootstrapConfiguration.class)
            .withBean(UserRepository.class, () -> mock(UserRepository.class))
            .withBean(PasswordEncoder.class, () -> mock(PasswordEncoder.class));

    @Test
    void disabledByDefaultWithoutRequiringCredentials() {
        context.run(application -> {
            assertThat(application).hasNotFailed();
            assertThat(application).doesNotHaveBean(InitialAdminInitializer.class);
        });
    }

    @Test
    void enabledWithExplicitCredentials() {
        context.withPropertyValues("app.bootstrap-admin.enabled=true",
                        "app.bootstrap-admin.email=admin@example.com",
                        "app.bootstrap-admin.password=TestOnly!Password")
                .run(application -> {
                    assertThat(application).hasNotFailed();
                    assertThat(application).hasSingleBean(InitialAdminInitializer.class);
                });
    }

    @Test
    void invalidPasswordFailsWithoutReportingItsValue() {
        context.withPropertyValues("app.bootstrap-admin.enabled=true",
                        "app.bootstrap-admin.email=admin@example.com",
                        "app.bootstrap-admin.password=short")
                .run(application -> {
                    assertThat(application).hasFailed();
                    assertThat(application.getStartupFailure()).hasRootCauseMessage(
                            "Bootstrap administrator password must contain 8 to 128 characters and not be blank.");
                });
    }

    @Test
    void failsWhenEnabledWithoutCredentials() {
        context.withPropertyValues("app.bootstrap-admin.enabled=true")
                .run(application -> assertThat(application).hasFailed());
    }
}
