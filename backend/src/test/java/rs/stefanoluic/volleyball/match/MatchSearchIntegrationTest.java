package rs.stefanoluic.volleyball.match;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
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
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "app.bootstrap-admin.enabled=false"})
@AutoConfigureMockMvc @Testcontainers
class MatchSearchIntegrationTest {
    @Container static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:18");
    @DynamicPropertySource static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired MatchRepository matches;
    @Autowired TeamRepository teams;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JdbcTemplate jdbc;
    private Team home, away, third;

    @BeforeEach void seed() {
        matches.deleteAll(); teams.deleteAll(); users.deleteAll();
        home = teams.saveAndFlush(new Team("Vojvodina", "Novi Sad"));
        away = teams.saveAndFlush(new Team("Partizan", "Beograd"));
        third = teams.saveAndFlush(new Team("Spartak", "Subotica"));
    }
    private Match fixture(Team h, Team a, String date, MatchStatus status) {
        var match = matches.saveAndFlush(new Match(h, a, Instant.parse(date)));
        jdbc.update("UPDATE volleyball.matches SET status=? WHERE id=?", status.name(), match.getId());
        return match;
    }
    private MockHttpSession login(UserRole role) throws Exception {
        String email = role.name().toLowerCase(Locale.ROOT) + "@example.com";
        users.saveAndFlush(new User("Test", "User", email, encoder.encode("TestOnly!Password"), role, UserStatus.ACTIVE));
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).param("email", email)
                .param("password", "TestOnly!Password")).andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }

    @Test void searchMatchesEitherTeamIgnoresCaseAndWhitespaceAndDoesNotSearchCities() throws Exception {
        var first = fixture(home, away, "2026-10-24T12:00:00Z", MatchStatus.SCHEDULED);
        var second = fixture(away, home, "2026-10-25T12:00:00Z", MatchStatus.FINISHED);
        fixture(away, third, "2026-10-26T12:00:00Z", MatchStatus.LIVE);
        var session = login(UserRole.COACH);
        mvc.perform(get("/api/matches").session(session).param("q", "  VOJvOd  ")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].id").value(second.getId().toString()))
                .andExpect(jsonPath("$.content[1].id").value(first.getId().toString()))
                .andExpect(jsonPath("$.content[0].homeTeam.name").value("Partizan"));
        mvc.perform(get("/api/matches").session(session).param("q", "Beograd")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
        assertThat(matches.count()).isEqualTo(3);
    }

    @ParameterizedTest @ValueSource(strings = {"%", "_", "\\"})
    void likeMetacharactersAreLiteralSearchText(String value) throws Exception {
        var special = teams.saveAndFlush(new Team("Tim " + value + " naziv", "Test"));
        var expected = fixture(special, away, "2026-10-24T12:00:00Z", MatchStatus.SCHEDULED);
        fixture(home, third, "2026-10-25T12:00:00Z", MatchStatus.SCHEDULED);
        mvc.perform(get("/api/matches").session(login(UserRole.COACH)).param("q", value)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(expected.getId().toString()));
    }

    @Test void unicodeSearchIsNormalizedLikeTeamNames() throws Exception {
        var special = teams.saveAndFlush(new Team("Železničar", "Test"));
        fixture(special, home, "2026-10-24T12:00:00Z", MatchStatus.SCHEDULED);
        mvc.perform(get("/api/matches").session(login(UserRole.COACH)).param("q", "Z\u030Celezničar"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
    }

    @ParameterizedTest
    @ValueSource(strings = {"' OR 1=1 --", "'; DROP TABLE volleyball.matches; --", "' UNION SELECT null --"})
    void sqlLikeSearchIsLiteralTextAndDoesNotModifyMatches(String value) throws Exception {
        var special = teams.saveAndFlush(new Team("Tim " + value + " naziv", "Test"));
        var expected = fixture(special, away, "2026-10-24T12:00:00Z", MatchStatus.SCHEDULED);
        fixture(home, third, "2026-10-25T12:00:00Z", MatchStatus.SCHEDULED);
        var session = login(UserRole.COACH);
        mvc.perform(get("/api/matches").session(session).param("q", value)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(expected.getId().toString()));
        mvc.perform(get("/api/matches").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
        assertThat(matches.count()).isEqualTo(2);
        assertThat(teams.count()).isEqualTo(4);
    }

    @Test void oversizedPageOffsetsReturnBadRequestAndSupportedEmptyPagesStillWork() throws Exception {
        fixture(home, away, "2026-10-24T12:00:00Z", MatchStatus.SCHEDULED);
        var session = login(UserRole.COACH);
        for (String page : List.of("21474837", "2147483647")) {
            mvc.perform(get("/api/matches").session(session).param("page", page).param("size", "100"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
        }
        mvc.perform(get("/api/matches").session(session).param("page", "2147483647").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @ParameterizedTest @EnumSource(MatchStatus.class)
    void eachStatusFiltersBothContentAndCounts(MatchStatus value) throws Exception {
        for (var status : MatchStatus.values()) fixture(home, away, "2026-10-24T12:00:00Z", status);
        mvc.perform(get("/api/matches").session(login(UserRole.STATISTICIAN)).param("status", value.name()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].status").value(value.name()));
    }

    @Test void dateRangeIncludesItsStartAndExcludesTheNextDayBoundary() throws Exception {
        fixture(home, away, "2026-10-23T21:59:59Z", MatchStatus.SCHEDULED);
        fixture(home, away, "2026-10-23T22:00:00Z", MatchStatus.SCHEDULED);
        fixture(home, away, "2026-10-24T21:59:59Z", MatchStatus.SCHEDULED);
        fixture(home, away, "2026-10-24T22:00:00Z", MatchStatus.SCHEDULED);
        mvc.perform(get("/api/matches").session(login(UserRole.COACH)).param("from", "2026-10-24T00:00:00+02:00")
                .param("until", "2026-10-25T00:00:00+02:00")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].scheduledAt").value("2026-10-24T21:59:59Z"))
                .andExpect(jsonPath("$.content[1].scheduledAt").value("2026-10-23T22:00:00Z"));
    }

    @Test void oneSidedBoundsAndAnEmptySearchAreSupported() throws Exception {
        fixture(home, away, "2026-10-23T12:00:00Z", MatchStatus.SCHEDULED);
        fixture(home, away, "2026-10-24T12:00:00Z", MatchStatus.SCHEDULED);
        var session = login(UserRole.COACH);
        mvc.perform(get("/api/matches").session(session).param("q", "   ").param("from", "2026-10-24T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/matches").session(session).param("until", "2026-10-24T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/matches").session(session).param("q", "   "))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test void combinedFiltersUseStablePaginationAndFilteredTotals() throws Exception {
        var one = fixture(home, away, "2026-10-24T12:00:00Z", MatchStatus.FINISHED);
        var two = fixture(away, home, "2026-10-24T12:00:00Z", MatchStatus.FINISHED);
        fixture(home, away, "2026-10-23T12:00:00Z", MatchStatus.FINISHED);
        fixture(home, away, "2026-10-24T12:00:00Z", MatchStatus.LIVE);
        fixture(away, third, "2026-10-24T12:00:00Z", MatchStatus.FINISHED);
        var expected = new ArrayList<>(List.of(one.getId().toString(), two.getId().toString()));
        expected.sort(String::compareTo);
        var session = login(UserRole.COACH);
        for (int page = 0; page < 2; page++) {
            mvc.perform(get("/api/matches").session(session).param("q", "vojvodina").param("status", "FINISHED")
                    .param("from", "2026-10-24T00:00:00Z").param("until", "2026-10-25T00:00:00Z")
                    .param("page", String.valueOf(page)).param("size", "1")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2))
                    .andExpect(jsonPath("$.content[0].id").value(expected.get(page)));
        }
    }

    @Test void invalidQueryStatusDatesAndRangesReturnBadRequest() throws Exception {
        var session = login(UserRole.COACH);
        for (var parameters : List.of(Map.of("q", "x".repeat(101)), Map.of("status", "OTHER"),
                Map.of("from", "2026-10-24T12:00"), Map.of("until", "not-a-date"),
                Map.of("from", "2026-10-25T00:00:00Z", "until", "2026-10-24T00:00:00Z"),
                Map.of("from", "2026-10-24T00:00:00Z", "until", "2026-10-24T00:00:00Z"))) {
            var request = get("/api/matches").session(session);
            parameters.forEach(request::param);
            mvc.perform(request).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
        }
        assertThat(matches.count()).isZero();
    }

    @Test void filtersDoNotBypassRolesOrBlockedAccountChecks() throws Exception {
        mvc.perform(get("/api/matches").param("q", "voj")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/matches").param("q", "voj").session(login(UserRole.ADMIN))).andExpect(status().isForbidden());
        var session = login(UserRole.COACH);
        jdbc.update("UPDATE volleyball.users SET status='BLOCKED' WHERE role='COACH'");
        mvc.perform(get("/api/matches").param("status", "LIVE").session(session)).andExpect(status().isUnauthorized());
    }
}
