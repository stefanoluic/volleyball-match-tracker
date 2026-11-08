package rs.stefanoluic.volleyball.auth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import rs.stefanoluic.volleyball.security.AuthenticatedUser;
import rs.stefanoluic.volleyball.user.*;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "app.bootstrap-admin.enabled=false"})
@AutoConfigureMockMvc
@Testcontainers
class AuthIntegrationTest {
    @Container
    static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }

    private static final String PASSWORD = "TestOnly!Password";
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper mapper;
    private User admin;

    @BeforeEach
    void seed() {
        users.deleteAll();
        admin = users.saveAndFlush(new User("Test", "Admin", "admin@example.com",
                encoder.encode(PASSWORD), UserRole.ADMIN, UserStatus.ACTIVE));
    }

    private Map<String, Object> registration(String email, String role) {
        return Map.of("firstName", "Test", "lastName", "User", "email", email,
                "password", PASSWORD, "confirmPassword", PASSWORD, "role", role);
    }

    private User account(String email, UserRole role, UserStatus status) {
        return users.saveAndFlush(new User("Test", "User", email, encoder.encode(PASSWORD), role, status));
    }

    private MockHttpSession login(String email) throws Exception {
        var result = mvc.perform(post("/api/auth/login").with(csrf())
                        .param("email", email).param("password", PASSWORD))
                .andExpect(status().isOk()).andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    @Test
    void registrationCreatesPendingHashedAccountAndRejectsDuplicateEmail() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(registration(" USER@Example.com ", "STATISTICIAN"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.email").value("user@example.com"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        User user = users.findByEmail("user@example.com").orElseThrow();
        assertThat(encoder.matches(PASSWORD, user.getPasswordHash())).isTrue();
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(registration("USER@example.com", "COACH"))))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", user.getEmail()).param("password", PASSWORD))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void publicRegistrationCannotChooseAdminOrBypassApproval() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(registration("intruder@example.com", "ADMIN"))))
                .andExpect(status().isBadRequest());
        var request = new java.util.HashMap<>(registration("coach@example.com", "COACH"));
        request.put("status", "ACTIVE");
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING"));
        assertThat(users.existsByEmail("intruder@example.com")).isFalse();
    }

    @Test
    void rejectsInvalidFieldsAndMismatchedPasswords() throws Exception {
        var request = new java.util.HashMap<>(registration("user@example.com", "COACH"));
        request.put("confirmPassword", "DifferentPassword");
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request))).andExpect(status().isBadRequest());
        request.put("firstName", "   ");
        request.put("email", "invalid-email");
        request.put("password", "short");
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.firstName").exists())
                .andExpect(jsonPath("$.errors.email").exists()).andExpect(jsonPath("$.errors.password").exists());
        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    void sessionLoginPersistsIdentityAndErasesPasswordFromPrincipal() throws Exception {
        var session = login("ADMIN@EXAMPLE.COM");
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        var context = (SecurityContext) session.getAttribute("SPRING_SECURITY_CONTEXT");
        assertThat(((AuthenticatedUser) context.getAuthentication().getPrincipal()).getPassword()).isNull();
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", admin.getEmail())
                .param("password", "wrong")).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {"user@example", "user@.com", "user@example.", "user@example..com",
            "user@@example.com", "user@example .com", "user@"})
    void rejectsEmailWithoutAValidDomainAndSuffix(String email) throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(registration(email, "COACH"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.email").exists());
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"' OR 1=1 --", "admin@example.com' --", "'; DROP TABLE volleyball.users; --"})
    void sqlLikeEmailCannotBypassLoginOrModifyAccounts(String email) throws Exception {
        var anonymous = new MockHttpSession();
        mvc.perform(post("/api/auth/login").session(anonymous).with(csrf())
                .param("email", email).param("password", PASSWORD)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").session(anonymous)).andExpect(status().isUnauthorized());
        assertThat(users.count()).isEqualTo(1);
        assertThat(users.findById(admin.getId()).orElseThrow().getPasswordHash()).isEqualTo(admin.getPasswordHash());
        login(admin.getEmail());
    }

    @Test
    void sqlLikePasswordCannotBypassPasswordVerification() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", admin.getEmail())
                .param("password", "' OR 1=1 --")).andExpect(status().isUnauthorized());
        login(admin.getEmail());
    }

    @ParameterizedTest
    @ValueSource(strings = {"Stefan2", "Oluic!", "O'Neil", "🙂", "-", "-Stefan", "Oluic-", "Ana--Marija"})
    void rejectsInvalidNamesOnBothFields(String name) throws Exception {
        var request = new java.util.HashMap<>(registration("user@example.com", "COACH"));
        request.put("firstName", name);
        request.put("lastName", name);
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.firstName").exists())
                .andExpect(jsonPath("$.errors.lastName").exists());
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ČĆŠĐŽčćšđž", "Стефан", "Z\u030Celjko", "Ana Marija", "Petrović-Jovanović",
            "Ana-Marija Petrović", "Ана Марија"})
    void acceptsNamesWithUnicodeLettersSpacesAndHyphens(String name) throws Exception {
        var request = new java.util.HashMap<>(registration("user@example.com", "COACH"));
        request.put("firstName", name);
        request.put("lastName", name);
        String normalized = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFC);
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.firstName").value(normalized))
                .andExpect(jsonPath("$.lastName").value(normalized));
    }

    @Test
    void anonymousAndOrdinaryUsersCannotUseAdminEndpoints() throws Exception {
        mvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
        User user = account("coach@example.com", UserRole.COACH, UserStatus.ACTIVE);
        var session = login(user.getEmail());
        mvc.perform(get("/api/admin/users").session(session)).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/users/" + user.getId() + "/block").session(session).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/users/" + user.getId() + "/approve").session(session).with(csrf()))
                .andExpect(status().isForbidden());
        assertThat(users.findById(user.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.ACTIVE);
    }

    @Test
    void adminCanApproveBlockAndReactivateButCannotModifyAdminAccounts() throws Exception {
        User user = account("stat@example.com", UserRole.STATISTICIAN, UserStatus.PENDING);
        var session = login(admin.getEmail());
        String path = "/api/admin/users/" + user.getId();
        mvc.perform(post(path + "/approve").session(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        mvc.perform(post(path + "/block").session(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("BLOCKED"));
        mvc.perform(post(path + "/approve").session(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        mvc.perform(post("/api/admin/users/" + admin.getId() + "/block").session(session).with(csrf()))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/admin/users/" + UUID.randomUUID() + "/approve").session(session).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void blockingRevokesExistingSessionOnNextRequestAndPreventsLogin() throws Exception {
        User user = account("coach@example.com", UserRole.COACH, UserStatus.ACTIVE);
        var userSession = login(user.getEmail());
        var adminSession = login(admin.getEmail());
        mvc.perform(post("/api/admin/users/" + user.getId() + "/block").session(adminSession).with(csrf()))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").session(userSession)).andExpect(status().isUnauthorized());
        assertThat(userSession.isInvalid()).isTrue();
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", user.getEmail()).param("password", PASSWORD))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminListFiltersPaginatesAndNeverContainsAdminOrPasswordHashes() throws Exception {
        account("pending@example.com", UserRole.COACH, UserStatus.PENDING);
        account("blocked@example.com", UserRole.STATISTICIAN, UserStatus.BLOCKED);
        var session = login(admin.getEmail());
        mvc.perform(get("/api/admin/users").session(session).param("status", "PENDING"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].email").value("pending@example.com"))
                .andExpect(jsonPath("$.content[0].passwordHash").doesNotExist());
        mvc.perform(get("/api/admin/users").session(session).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(get("/api/admin/users").session(session).param("size", "101"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/users").session(session).param("page", "-1"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/users").session(session).param("page", "2147483647").param("size", "100"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
        mvc.perform(get("/api/admin/users").session(session).param("status", "UNKNOWN"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminPermanentlyDeletesBlockedAccountAndEmailCanBeRegisteredAgain() throws Exception {
        User user = account("deleted@example.com", UserRole.COACH, UserStatus.ACTIVE);
        User remaining = account("remaining@example.com", UserRole.STATISTICIAN, UserStatus.BLOCKED);
        var userSession = login(user.getEmail());
        var adminSession = login(admin.getEmail());
        String path = "/api/admin/users/" + user.getId();
        mvc.perform(post(path + "/block").session(adminSession).with(csrf())).andExpect(status().isOk());
        mvc.perform(delete(path).session(adminSession).with(csrf())).andExpect(status().isNoContent());
        assertThat(users.existsById(user.getId())).isFalse();
        assertThat(users.existsByEmail(user.getEmail())).isFalse();
        assertThat(users.existsById(admin.getId())).isTrue();
        assertThat(users.existsById(remaining.getId())).isTrue();
        mvc.perform(get("/api/admin/users").session(adminSession).param("status", "BLOCKED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].email").value(remaining.getEmail()));
        mvc.perform(get("/api/auth/me").session(userSession)).andExpect(status().isUnauthorized());
        assertThat(userSession.isInvalid()).isTrue();
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", user.getEmail()).param("password", PASSWORD))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete(path).session(adminSession).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(registration(user.getEmail(), "COACH"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING"));
        assertThat(users.findByEmail(user.getEmail()).orElseThrow().getId()).isNotEqualTo(user.getId());
    }

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"PENDING", "ACTIVE", "REJECTED"})
    void adminCannotDeleteAccountsThatAreNotBlocked(UserStatus status) throws Exception {
        User user = account("kept@example.com", UserRole.COACH, status);
        var session = login(admin.getEmail());
        mvc.perform(delete("/api/admin/users/" + user.getId()).session(session).with(csrf()))
                .andExpect(status().isConflict());
        assertThat(users.findById(user.getId()).orElseThrow().getStatus()).isEqualTo(status);
    }

    @Test
    void adminCannotDeleteAdministratorOrMissingAccount() throws Exception {
        var session = login(admin.getEmail());
        mvc.perform(delete("/api/admin/users/" + admin.getId()).session(session).with(csrf()))
                .andExpect(status().isConflict());
        User blockedAdmin = account("blocked-admin@example.com", UserRole.ADMIN, UserStatus.BLOCKED);
        mvc.perform(delete("/api/admin/users/" + blockedAdmin.getId()).session(session).with(csrf()))
                .andExpect(status().isConflict());
        mvc.perform(delete("/api/admin/users/" + UUID.randomUUID()).session(session).with(csrf()))
                .andExpect(status().isNotFound());
        assertThat(users.count()).isEqualTo(2);
    }

    @Test
    void deletionRequiresAdminSessionAndCsrfToken() throws Exception {
        User blocked = account("blocked@example.com", UserRole.COACH, UserStatus.BLOCKED);
        String path = "/api/admin/users/" + blocked.getId();
        mvc.perform(delete(path).with(csrf())).andExpect(status().isUnauthorized());
        for (UserRole role : new UserRole[]{UserRole.COACH, UserRole.STATISTICIAN}) {
            User ordinary = account(role.name().toLowerCase() + "@example.com", role, UserStatus.ACTIVE);
            mvc.perform(delete(path).session(login(ordinary.getEmail())).with(csrf()))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(delete(path).session(login(admin.getEmail()))).andExpect(status().isForbidden());
        assertThat(users.existsById(blocked.getId())).isTrue();
    }

    @Test
    void csrfIsRequiredForRegistrationLoginAdminChangesAndLogout() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(registration("user@example.com", "COACH"))))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/login").param("email", admin.getEmail()).param("password", PASSWORD))
                .andExpect(status().isForbidden());
        var session = login(admin.getEmail());
        mvc.perform(post("/api/admin/users/" + admin.getId() + "/block").session(session))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
    }

    @Test
    void realCsrfTokenWorksLoginRotatesSessionAndOldTokenIsRejected() throws Exception {
        var csrfResult = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) csrfResult.getRequest().getSession(false);
        String oldId = session.getId();
        var token = mapper.readTree(csrfResult.getResponse().getContentAsString());
        String header = token.get("headerName").asText();
        String oldToken = token.get("token").asText();
        mvc.perform(post("/api/auth/login").session(session).header(header, oldToken)
                .param("email", admin.getEmail()).param("password", PASSWORD)).andExpect(status().isOk());
        assertThat(session.getId()).isNotEqualTo(oldId);
        mvc.perform(post("/api/auth/logout").session(session).header(header, oldToken))
                .andExpect(status().isForbidden());
        var fresh = mvc.perform(get("/api/auth/csrf").session(session)).andExpect(status().isOk()).andReturn();
        String newToken = mapper.readTree(fresh.getResponse().getContentAsString()).get("token").asText();
        mvc.perform(post("/api/auth/logout").session(session).header(header, newToken))
                .andExpect(status().isNoContent());
        assertThat(session.isInvalid()).isTrue();
        mvc.perform(get("/api/auth/me").cookie(new Cookie("JSESSIONID", oldId)))
                .andExpect(status().isUnauthorized());
    }
}
