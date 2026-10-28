package rs.stefanoluic.volleyball.demo;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import rs.stefanoluic.volleyball.match.MatchRepository;
import rs.stefanoluic.volleyball.match.roster.MatchRosterService;
import rs.stefanoluic.volleyball.player.PlayerRepository;
import rs.stefanoluic.volleyball.team.TeamRepository;
import rs.stefanoluic.volleyball.user.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.ArgumentMatchers.anyString;

class DemoDataConfigurationTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(DemoDataConfiguration.class)
            .withBean(UserRepository.class, () -> mock(UserRepository.class))
            .withBean(TeamRepository.class, () -> mock(TeamRepository.class))
            .withBean(PlayerRepository.class, () -> mock(PlayerRepository.class))
            .withBean(MatchRepository.class, () -> mock(MatchRepository.class))
            .withBean(MatchRosterService.class, () -> mock(MatchRosterService.class))
            .withBean(PasswordEncoder.class, () -> mock(PasswordEncoder.class))
            .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));

    @Test void normalStartupDoesNotEnableDemoOrRequireItsPassword() {
        context.run(app -> {
            assertThat(app).hasNotFailed().doesNotHaveBean(DemoDataInitializer.class);
            verifyNoInteractions(app.getBean(UserRepository.class));
            verify(app.getBean(JdbcTemplate.class), never()).execute(anyString());
        });
    }

    @Test void passwordAloneDoesNotEnableDemo() {
        context.withPropertyValues("app.demo.password=TestOnly!Password").run(app ->
                assertThat(app).hasNotFailed().doesNotHaveBean(DemoDataInitializer.class));
    }

    @Test void demoProfileAndExplicitPasswordEnableInitializer() {
        demo().withPropertyValues("app.demo.password=TestOnly!Password").run(app -> {
            assertThat(app).hasNotFailed().hasSingleBean(DemoDataInitializer.class);
            verifyNoInteractions(app.getBean(UserRepository.class));
            verify(app.getBean(JdbcTemplate.class), never()).execute(anyString());
        });
    }

    @ParameterizedTest @ValueSource(ints = {8, 128})
    void acceptsPasswordLengthBoundaries(int length) {
        demo().withPropertyValues("app.demo.password=" + "x".repeat(length)).run(app ->
                assertThat(app).hasNotFailed().hasSingleBean(DemoDataInitializer.class));
    }

    @ParameterizedTest @NullAndEmptySource @ValueSource(strings = {"short", "        "})
    void invalidPasswordFailsWithoutDisclosingItsValue(String password) {
        var configured = password == null ? demo() : demo().withPropertyValues("app.demo.password=" + password);
        configured.run(app -> {
            assertThat(app).hasFailed();
            assertThat(app.getStartupFailure()).hasRootCauseMessage(
                    "Demo password must contain 8 to 128 characters and not be blank.");
        });
    }

    @Test void overlongPasswordFailsAndIsRedacted() {
        String secret = "x".repeat(129);
        demo().withPropertyValues("app.demo.password=" + secret).run(app -> {
            assertThat(app).hasFailed();
            var trace = new java.io.StringWriter();
            app.getStartupFailure().printStackTrace(new java.io.PrintWriter(trace));
            assertThat(trace.toString()).doesNotContain(secret);
        });
        assertThat(new DemoDataProperties(secret).toString()).doesNotContain(secret);
    }

    @Test void conflictingAdministratorBootstrapIsRejectedBeforeAnyRunnerCanWrite() {
        demo().withPropertyValues("app.demo.password=TestOnly!Password", "app.bootstrap-admin.enabled=true")
                .run(app -> {
                    assertThat(app).hasFailed();
                    assertThat(app.getStartupFailure()).hasRootCauseMessage(
                            "Disable administrator bootstrap when using the demo profile.");
                });
    }

    private ApplicationContextRunner demo() {
        return context.withInitializer(app -> app.getEnvironment().setActiveProfiles("demo"));
    }
}
