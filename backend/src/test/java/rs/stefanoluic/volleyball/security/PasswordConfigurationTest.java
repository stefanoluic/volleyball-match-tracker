package rs.stefanoluic.volleyball.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordConfigurationTest {

    @Test
    void hashesWithArgon2idAndChecksPasswords() {
        var encoder = new PasswordConfiguration().passwordEncoder();
        String password = "TestOnly!Password";
        String firstHash = encoder.encode(password);
        String secondHash = encoder.encode(password);

        assertThat(firstHash).startsWith("$argon2id$").isNotEqualTo(password);
        assertThat(secondHash).isNotEqualTo(firstHash);
        assertThat(encoder.matches(password, firstHash)).isTrue();
        assertThat(encoder.matches("incorrect-password", firstHash)).isFalse();
    }
}
