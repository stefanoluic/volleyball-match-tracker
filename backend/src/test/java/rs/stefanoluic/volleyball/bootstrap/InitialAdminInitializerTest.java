package rs.stefanoluic.volleyball.bootstrap;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.password.PasswordEncoder;
import rs.stefanoluic.volleyball.user.User;
import rs.stefanoluic.volleyball.user.UserRepository;
import rs.stefanoluic.volleyball.user.UserRole;
import rs.stefanoluic.volleyball.user.UserStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class InitialAdminInitializerTest {

    private static final String EMAIL = "admin@example.com";
    private static final String PASSWORD = "TestOnly!Password";

    private UserRepository users;
    private PasswordEncoder encoder;
    private InitialAdminInitializer initializer;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        encoder = mock(PasswordEncoder.class);
        initializer = new InitialAdminInitializer(users, encoder,
                new AdminBootstrapProperties(EMAIL, PASSWORD));
    }

    @Test
    void createsActiveAdminWithEncodedPassword() {
        when(users.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(encoder.encode(PASSWORD)).thenReturn("encoded-password");

        initializer.run(new DefaultApplicationArguments());

        var captured = ArgumentCaptor.forClass(User.class);
        verify(users).saveAndFlush(captured.capture());
        User admin = captured.getValue();
        assertThat(admin.getEmail()).isEqualTo(EMAIL);
        assertThat(admin.getRole()).isEqualTo(UserRole.ADMIN);
        assertThat(admin.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(admin.getPasswordHash()).isEqualTo("encoded-password");
        assertThat(admin.getCreatedAt()).isNotNull();
    }

    @Test
    void leavesExistingAdminAndPasswordUnchanged() {
        User admin = new User("Existing", "Admin", EMAIL, "original-hash",
                UserRole.ADMIN, UserStatus.ACTIVE);
        when(users.findByEmail(EMAIL)).thenReturn(Optional.of(admin));

        initializer.run(new DefaultApplicationArguments());
        initializer.run(new DefaultApplicationArguments());

        assertThat(admin.getPasswordHash()).isEqualTo("original-hash");
        verify(users, never()).saveAndFlush(any());
        verifyNoInteractions(encoder);
    }

    @Test
    void doesNotCreateAnotherAdminWhenOneAlreadyExists() {
        when(users.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(users.existsByRole(UserRole.ADMIN)).thenReturn(true);

        initializer.run(new DefaultApplicationArguments());

        verify(users, never()).saveAndFlush(any());
        verifyNoInteractions(encoder);
    }

    @ParameterizedTest
    @CsvSource({"COACH,ACTIVE", "STATISTICIAN,PENDING", "ADMIN,PENDING", "ADMIN,REJECTED"})
    void refusesToPromoteOrReactivateExistingAccount(UserRole role, UserStatus status) {
        User existing = new User("Existing", "User", EMAIL, "original-hash", role, status);
        when(users.findByEmail(EMAIL)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> initializer.run(new DefaultApplicationArguments()))
                .isInstanceOf(IllegalStateException.class);

        assertThat(existing.getRole()).isEqualTo(role);
        assertThat(existing.getStatus()).isEqualTo(status);
        verify(users, never()).saveAndFlush(any());
        verifyNoInteractions(encoder);
    }

    @Test
    void normalizesBootstrapEmailBeforeLookingItUp() {
        var mixedCase = new InitialAdminInitializer(users, encoder,
                new AdminBootstrapProperties(" ADMIN@Example.com ", PASSWORD));
        when(users.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(users.existsByRole(UserRole.ADMIN)).thenReturn(true);

        mixedCase.run(new DefaultApplicationArguments());

        verify(users).findByEmail(EMAIL);
    }

    @Test
    void propertiesDoNotExposePasswordInToString() {
        assertThat(new AdminBootstrapProperties(EMAIL, PASSWORD).toString())
                .doesNotContain(PASSWORD).contains("[REDACTED]");
    }
}
