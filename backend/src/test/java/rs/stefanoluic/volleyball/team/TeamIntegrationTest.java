package rs.stefanoluic.volleyball.team;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import rs.stefanoluic.volleyball.user.User;
import rs.stefanoluic.volleyball.user.UserRepository;
import rs.stefanoluic.volleyball.user.UserRole;
import rs.stefanoluic.volleyball.user.UserStatus;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "app.bootstrap-admin.enabled=false"})
@AutoConfigureMockMvc
@Testcontainers
class TeamIntegrationTest {
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
    @Autowired TeamRepository teams;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper mapper;

    @BeforeEach
    void seed() {
        teams.deleteAll();
        users.deleteAll();
        for (UserRole role : UserRole.values()) {
            users.saveAndFlush(new User("Test", "User", email(role),
                    encoder.encode(PASSWORD), role, UserStatus.ACTIVE));
        }
    }

    private static String email(UserRole role) {
        return role.name().toLowerCase(java.util.Locale.ROOT) + "@example.com";
    }

    private MockHttpSession login(UserRole role) throws Exception {
        var result = mvc.perform(post("/api/auth/login").with(csrf())
                        .param("email", email(role)).param("password", PASSWORD))
                .andExpect(status().isOk()).andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private String input(String name, String city) {
        return mapper.writeValueAsString(Map.of("name", name, "city", city));
    }

    @Test
    void statisticianCreatesTeamAndCoachCanReadIt() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        var response = mvc.perform(post("/api/teams").session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(input("  OK Vojvodina  ", " Novi Sad ")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("OK Vojvodina"))
                .andExpect(jsonPath("$.city").value("Novi Sad")).andExpect(jsonPath("$.createdAt").exists()).andReturn();
        UUID id = UUID.fromString(mapper.readTree(response.getResponse().getContentAsString()).get("id").asString());
        assertThat(teams.findById(id).orElseThrow().getName()).isEqualTo("OK Vojvodina");
        var coach = login(UserRole.COACH);
        mvc.perform(get("/api/teams/" + id).session(coach)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("OK Vojvodina"));
        mvc.perform(get("/api/teams").session(coach)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void statisticianUpdatesAndPermanentlyDeletesTeam() throws Exception {
        Team team = teams.saveAndFlush(new Team("Old name", "Novi Sad"));
        var createdAt = teams.findById(team.getId()).orElseThrow().getCreatedAt();
        var session = login(UserRole.STATISTICIAN);
        String path = "/api/teams/" + team.getId();
        mvc.perform(put(path).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("OK Novi Sad", "Beograd")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(team.getId().toString()))
                .andExpect(jsonPath("$.name").value("OK Novi Sad")).andExpect(jsonPath("$.city").value("Beograd"));
        assertThat(teams.findById(team.getId()).orElseThrow().getCreatedAt()).isEqualTo(createdAt);
        mvc.perform(delete(path).session(session).with(csrf())).andExpect(status().isNoContent());
        assertThat(teams.existsById(team.getId())).isFalse();
        mvc.perform(get(path).session(session)).andExpect(status().isNotFound());
        mvc.perform(get("/api/teams").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
        assertThat(users.count()).isEqualTo(3);
    }

    @Test
    void duplicateTeamIsRejectedIgnoringCaseButNameCanExistInAnotherCity() throws Exception {
        teams.saveAndFlush(new Team("OK Vojvodina", "Novi Sad"));
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(post("/api/teams").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input(" ok vojvodina ", " NOVI SAD ")))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/teams").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("OK Vojvodina", "Beograd")))
                .andExpect(status().isCreated());
        assertThat(teams.count()).isEqualTo(2);
    }

    @Test
    void uniqueDatabaseIndexPreventsDuplicateEvenWhenServiceIsBypassed() {
        teams.saveAndFlush(new Team("OK Vojvodina", "Novi Sad"));
        assertThatThrownBy(() -> teams.saveAndFlush(new Team("ok vojvodina", "NOVI SAD")))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(teams.count()).isEqualTo(1);
    }

    @Test
    void updateCannotDuplicateAnotherTeamButCanKeepItsOwnName() throws Exception {
        Team first = teams.saveAndFlush(new Team("First", "Novi Sad"));
        Team second = teams.saveAndFlush(new Team("Second", "Beograd"));
        var session = login(UserRole.STATISTICIAN);
        String path = "/api/teams/" + second.getId();
        mvc.perform(put(path).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("first", "NOVI SAD"))).andExpect(status().isConflict());
        assertThat(teams.findById(second.getId()).orElseThrow().getName()).isEqualTo("Second");
        assertThat(teams.existsById(first.getId())).isTrue();
        mvc.perform(put(path).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("SECOND", "Beograd"))).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"name", "city"})
    void rejectsMissingBlankNullAndOverlongFieldsWithoutSaving(String field) throws Exception {
        var session = login(UserRole.STATISTICIAN);
        for (String value : new String[]{"", "   ", null, "a".repeat(101)}) {
            var request = new HashMap<String, Object>(Map.of("name", "Team", "city", "Novi Sad"));
            request.put(field, value);
            mvc.perform(post("/api/teams").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(request)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + field).exists());
        }
        var request = new HashMap<String, Object>(Map.of("name", "Team", "city", "Novi Sad"));
        request.remove(field);
        mvc.perform(post("/api/teams").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request))).andExpect(status().isBadRequest());
        assertThat(teams.count()).isZero();
    }

    @Test
    void acceptsSerbianLettersNumbersAndPunctuationInTeamName() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(post("/api/teams").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("Železničar 2026 (U-21)", "Čačak")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Železničar 2026 (U-21)"));
    }

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"COACH", "ADMIN"})
    void coachAndAdminCannotModifyTeams(UserRole role) throws Exception {
        Team team = teams.saveAndFlush(new Team("Kept team", "Novi Sad"));
        var session = login(role);
        mvc.perform(post("/api/teams").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("New team", "Beograd"))).andExpect(status().isForbidden());
        mvc.perform(put("/api/teams/" + team.getId()).session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(input("Changed", "Beograd")))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/teams/" + team.getId()).session(session).with(csrf()))
                .andExpect(status().isForbidden());
        if (role == UserRole.ADMIN) {
            mvc.perform(get("/api/teams").session(session)).andExpect(status().isForbidden());
            mvc.perform(get("/api/teams/" + team.getId()).session(session)).andExpect(status().isForbidden());
        }
        assertThat(teams.count()).isEqualTo(1);
        assertThat(teams.findById(team.getId()).orElseThrow().getName()).isEqualTo("Kept team");
    }

    @Test
    void anonymousRequestsAndMissingCsrfCannotChangeTeams() throws Exception {
        Team team = teams.saveAndFlush(new Team("Kept team", "Novi Sad"));
        mvc.perform(get("/api/teams")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/teams/" + team.getId())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/teams").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("New", "Beograd"))).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/teams/" + team.getId()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("Changed", "Beograd"))).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/teams/" + team.getId()).with(csrf())).andExpect(status().isUnauthorized());
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(post("/api/teams").session(session).contentType(MediaType.APPLICATION_JSON)
                        .content(input("New", "Beograd"))).andExpect(status().isForbidden());
        mvc.perform(put("/api/teams/" + team.getId()).session(session).contentType(MediaType.APPLICATION_JSON)
                        .content(input("Changed", "Beograd"))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/teams/" + team.getId()).session(session)).andExpect(status().isForbidden());
        assertThat(teams.count()).isEqualTo(1);
    }

    @Test
    void blockingStatisticianRevokesAccessToTeamsWithAnExistingSession() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        User statistician = users.findByEmail(email(UserRole.STATISTICIAN)).orElseThrow();
        statistician.block();
        users.saveAndFlush(statistician);
        mvc.perform(get("/api/teams").session(session)).andExpect(status().isUnauthorized());
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void listPaginatesAndRejectsInvalidPageParameters() throws Exception {
        teams.saveAndFlush(new Team("Beta", "Novi Sad"));
        teams.saveAndFlush(new Team("Alpha", "Beograd"));
        var session = login(UserRole.COACH);
        mvc.perform(get("/api/teams").session(session).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.content[0].name").value("Alpha"));
        mvc.perform(get("/api/teams").session(session).param("size", "1").param("page", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].name").value("Beta"));
        for (String size : new String[]{"0", "101", "invalid"}) {
            mvc.perform(get("/api/teams").session(session).param("size", size)).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/teams").session(session).param("page", "-1")).andExpect(status().isBadRequest());
    }

    @Test
    void missingTeamsMalformedUuidAndInvalidUpdateAreRejected() throws Exception {
        var session = login(UserRole.STATISTICIAN);
        String missing = "/api/teams/" + UUID.randomUUID();
        mvc.perform(get(missing).session(session)).andExpect(status().isNotFound());
        mvc.perform(put(missing).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(input("New", "Novi Sad"))).andExpect(status().isNotFound());
        mvc.perform(delete(missing).session(session).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(get("/api/teams/not-a-uuid").session(session)).andExpect(status().isBadRequest());
        Team team = teams.saveAndFlush(new Team("Kept team", "Novi Sad"));
        mvc.perform(put("/api/teams/" + team.getId()).session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(input(" ", "")))
                .andExpect(status().isBadRequest());
        assertThat(teams.findById(team.getId()).orElseThrow().getName()).isEqualTo("Kept team");
    }
}
