package rs.stefanoluic.volleyball.match;

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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import rs.stefanoluic.volleyball.team.*;
import rs.stefanoluic.volleyball.user.*;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
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
class MatchIntegrationTest {
    @Container
    static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired MatchRepository matches;
    @Autowired TeamRepository teams;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    private Team home;
    private Team away;
    private static final String PASSWORD = "TestOnly!Password";

    @BeforeEach
    void seed() {
        matches.deleteAll();
        teams.deleteAll();
        users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad"));
        away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        for (UserRole role : UserRole.values()) {
            users.saveAndFlush(new User("Test", "User", email(role),
                    encoder.encode(PASSWORD), role, UserStatus.ACTIVE));
        }
    }

    private String email(UserRole role) { return role.name().toLowerCase(java.util.Locale.ROOT) + "@example.com"; }

    private MockHttpSession login(UserRole role) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf())
                .param("email", email(role)).param("password", PASSWORD))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }

    private Map<String, Object> input() {
        return new HashMap<>(Map.of("homeTeamId", home.getId(), "awayTeamId", away.getId(),
                "scheduledAt", "2026-10-15T18:00:00+02:00"));
    }

    private Match saved() {
        return matches.saveAndFlush(new Match(home, away, Instant.parse("2026-10-15T16:00:00Z")));
    }

    @Test
    void createsScheduledMatchWithCorrectTimezoneAndIgnoresClientStatus() throws Exception {
        var data = input();
        data.put("status", "LIVE");
        mvc.perform(post("/api/matches").session(login(UserRole.STATISTICIAN)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.scheduledAt").value("2026-10-15T16:00:00Z"))
                .andExpect(jsonPath("$.homeTeam.id").value(home.getId().toString()))
                .andExpect(jsonPath("$.awayTeam.name").value("Partizan"));
        assertThat(matches.count()).isEqualTo(1);
    }

    @Test
    void updatesParticipantsAndTimeAndDeletesOnlyMatch() throws Exception {
        Match match = saved();
        Instant originalCreatedAt = matches.findById(match.getId()).orElseThrow().getCreatedAt();
        var session = login(UserRole.STATISTICIAN);
        var data = input();
        data.put("homeTeamId", away.getId());
        data.put("awayTeamId", home.getId());
        data.put("scheduledAt", "2026-10-16T17:30:00Z");
        String path = "/api/matches/" + match.getId();
        mvc.perform(put(path).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(data))).andExpect(status().isOk())
                .andExpect(jsonPath("$.homeTeam.id").value(away.getId().toString()))
                .andExpect(jsonPath("$.createdAt").exists());
        assertThat(matches.findById(match.getId()).orElseThrow().getCreatedAt()).isEqualTo(originalCreatedAt);
        mvc.perform(delete(path).session(session).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get(path).session(session)).andExpect(status().isNotFound());
        assertThat(matches.count()).isZero();
        assertThat(teams.count()).isEqualTo(2);
    }

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"COACH", "ADMIN"})
    void rolesCannotMutate(UserRole role) throws Exception {
        Match match = saved();
        var session = login(role);
        for (var builder : new org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder[]{
                post("/api/matches"), put("/api/matches/" + match.getId())}) {
            mvc.perform(builder.session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(input()))).andExpect(status().isForbidden());
        }
        mvc.perform(delete("/api/matches/" + match.getId()).session(session).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/matches").session(session))
                .andExpect(role == UserRole.COACH ? status().isOk() : status().isForbidden());
        mvc.perform(get("/api/matches/" + match.getId()).session(session))
                .andExpect(role == UserRole.COACH ? status().isOk() : status().isForbidden());
        assertThat(matches.count()).isEqualTo(1);
    }

    @Test
    void anonymousAndMissingCsrfAreRejected() throws Exception {
        mvc.perform(get("/api/matches")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/matches").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(input()))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/matches").session(login(UserRole.STATISTICIAN))
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(input())))
                .andExpect(status().isForbidden());
        assertThat(matches.count()).isZero();
    }

    @Test
    void sameTeamAndMissingTeamAreRejectedOnCreateAndEdit() throws Exception {
        Match match = saved();
        var session = login(UserRole.STATISTICIAN);
        for (String path : new String[]{"/api/matches", "/api/matches/" + match.getId()}) {
            var data = input();
            data.put("awayTeamId", home.getId());
            mvc.perform((path.equals("/api/matches") ? post(path) : put(path)).session(session).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                    .andExpect(status().isBadRequest());
            data.put("awayTeamId", UUID.randomUUID());
            mvc.perform((path.equals("/api/matches") ? post(path) : put(path)).session(session).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                    .andExpect(status().isNotFound());
        }
        assertThat(matches.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"homeTeamId", "awayTeamId", "scheduledAt"})
    void requiredFieldsAreValidated(String field) throws Exception {
        var data = input();
        data.put(field, null);
        mvc.perform(post("/api/matches").session(login(UserRole.STATISTICIAN)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + field).exists());
        assertThat(matches.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-a-date", "2026-10-15T18:00", "", "2026-99-99T00:00:00Z"})
    void malformedAndTimezoneFreeDatesAreRejected(String value) throws Exception {
        var data = input();
        data.put("scheduledAt", value);
        mvc.perform(post("/api/matches").session(login(UserRole.STATISTICIAN)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @EnumSource(value = MatchStatus.class, names = {"LIVE", "FINISHED"})
    void nonScheduledMatchesCannotBeEditedOrDeleted(MatchStatus value) throws Exception {
        Match match = saved();
        jdbc.update("UPDATE volleyball.matches SET status=? WHERE id=?", value.name(), match.getId());
        var session = login(UserRole.STATISTICIAN);
        String path = "/api/matches/" + match.getId();
        mvc.perform(put(path).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(input()))).andExpect(status().isConflict());
        mvc.perform(delete(path).session(session).with(csrf())).andExpect(status().isConflict());
        assertThat(matches.existsById(match.getId())).isTrue();
    }

    @Test
    void referencedTeamsCannotBeDeletedButAreFreedAfterDeletingMatch() throws Exception {
        Match match = saved();
        var session = login(UserRole.STATISTICIAN);
        for (Team team : new Team[]{home, away}) {
            mvc.perform(delete("/api/teams/" + team.getId()).session(session).with(csrf()))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value(
                            "Tim nije moguće obrisati dok je povezan sa utakmicom."));
        }
        mvc.perform(delete("/api/matches/" + match.getId()).session(session).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/teams/" + home.getId()).session(session).with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void databaseEnforcesDistinctTeamsStatusAndForeignKeys() {
        assertThatThrownBy(() -> matches.saveAndFlush(new Match(home, home, Instant.now())))
                .isInstanceOf(DataIntegrityViolationException.class);
        Match match = saved();
        assertThatThrownBy(() -> teams.deleteById(home.getId())).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> teams.deleteById(away.getId())).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE volleyball.matches SET status='UNKNOWN' WHERE id=?", match.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE volleyball.matches SET away_team_id=? WHERE id=?",
                UUID.randomUUID(), match.getId())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void listIsPaginatedSortedAndUnknownIdentifiersAreRejected() throws Exception {
        Match first = saved();
        matches.saveAndFlush(new Match(away, home, Instant.parse("2026-10-16T16:00:00Z")));
        var session = login(UserRole.COACH);
        mvc.perform(get("/api/matches?page=0&size=1").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.content[0].scheduledAt").value("2026-10-16T16:00:00Z"));
        mvc.perform(get("/api/matches?page=1&size=1").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(first.getId().toString()));
        for (String query : new String[]{"page=-1", "size=0", "size=101", "page=no"}) {
            mvc.perform(get("/api/matches?" + query).session(session)).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/matches/" + UUID.randomUUID()).session(session)).andExpect(status().isNotFound());
        mvc.perform(get("/api/matches/not-an-id").session(session)).andExpect(status().isBadRequest());
    }
}
