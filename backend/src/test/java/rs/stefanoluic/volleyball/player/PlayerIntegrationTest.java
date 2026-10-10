package rs.stefanoluic.volleyball.player;

import rs.stefanoluic.volleyball.team.Team;
import rs.stefanoluic.volleyball.team.TeamRepository;
import rs.stefanoluic.volleyball.player.dto.PlayerRequest;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.concurrent.*;

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
class PlayerIntegrationTest {
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
    @Autowired PlayerRepository players;
    @Autowired PlayerService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper mapper;

    @BeforeEach
    void seed() {
        players.deleteAll();
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



    private Team team(String name) {
        return teams.saveAndFlush(new Team(name, "Novi Sad"));
    }

    private String path(Team team) {
        return "/api/teams/" + team.getId() + "/players";
    }

    private Map<String, Object> input(int jersey, PlayerPosition position) {
        return new HashMap<>(Map.of("firstName", "Marko", "lastName", "Marković",
                "jerseyNumber", jersey, "position", position.name()));
    }

    private Player player(Team team, int jersey) {
        return players.saveAndFlush(new Player(team, "Marko", "Marković", jersey, PlayerPosition.SETTER));
    }

    @ParameterizedTest
    @EnumSource(PlayerPosition.class)
    void statisticianCreatesAllFivePositionsAndCoachReadsRoster(PlayerPosition position) throws Exception {
        Team team = team("Team");
        var data = input(7, position);
        data.put("firstName", "  Željko-Marko ");
        data.put("lastName", " Petrović Jovanović ");
        var result = mvc.perform(post(path(team)).session(login(UserRole.STATISTICIAN)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.firstName").value("Željko-Marko"))
                .andExpect(jsonPath("$.lastName").value("Petrović Jovanović"))
                .andExpect(jsonPath("$.position").value(position.name()))
                .andExpect(jsonPath("$.teamId").value(team.getId().toString()))
                .andExpect(jsonPath("$.jerseyNumber").value(7)).andReturn();
        UUID id = UUID.fromString(mapper.readTree(result.getResponse().getContentAsString()).get("id").asString());
        var coach = login(UserRole.COACH);
        mvc.perform(get(path(team)).session(coach)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get(path(team) + "/" + id).session(coach)).andExpect(status().isOk())
                .andExpect(jsonPath("$.position").value(position.name()));
    }

    @Test
    void updateAndPhysicalDeletePreserveTeamAndAccounts() throws Exception {
        Team team = team("Team");
        Player player = player(team, 7);
        var createdAt = players.findById(player.getId()).orElseThrow().getCreatedAt();
        var session = login(UserRole.STATISTICIAN);
        String path = path(team) + "/" + player.getId();
        mvc.perform(put(path).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(input(12, PlayerPosition.LIBERO))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.jerseyNumber").value(12))
                .andExpect(jsonPath("$.position").value("LIBERO"));
        assertThat(players.findById(player.getId()).orElseThrow().getCreatedAt()).isEqualTo(createdAt);
        mvc.perform(delete(path).session(session).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get(path).session(session)).andExpect(status().isNotFound());
        assertThat(players.existsById(player.getId())).isFalse();
        assertThat(teams.existsById(team.getId())).isTrue();
        assertThat(users.count()).isEqualTo(3);
    }

    @Test
    void jerseyIsUniqueWithinTeamButAllowedInAnotherTeamAndUnchangedOnEdit() throws Exception {
        Team first = team("First");
        Team second = team("Second");
        Player firstPlayer = player(first, 7);
        Player other = player(first, 12);
        var session = login(UserRole.STATISTICIAN);
        String data = mapper.writeValueAsString(input(7, PlayerPosition.SETTER));
        mvc.perform(post(path(first)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(data)).andExpect(status().isConflict());
        mvc.perform(post(path(second)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(data)).andExpect(status().isCreated());
        mvc.perform(put(path(first) + "/" + other.getId()).session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(data)).andExpect(status().isConflict());
        mvc.perform(put(path(first) + "/" + firstPlayer.getId()).session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(data)).andExpect(status().isOk());
        assertThat(players.findById(other.getId()).orElseThrow().getJerseyNumber()).isEqualTo(12);
    }

    @Test
    void teamWithPlayersCannotBeDeletedUntilItsRosterIsEmpty() throws Exception {
        Team team = team("Team");
        Player player = player(team, 7);
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(delete("/api/teams/" + team.getId()).session(session).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value(
                        "Tim nije moguće obrisati dok ima igrače. Najpre obrišite njegove igrače."));
        assertThat(teams.existsById(team.getId())).isTrue();
        assertThat(players.existsById(player.getId())).isTrue();
        mvc.perform(delete(path(team) + "/" + player.getId()).session(session).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/teams/" + team.getId()).session(session).with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void databaseAlsoProtectsJerseyUniquenessAndTeamForeignKeyWithoutService() {
        Team team = team("Team");
        Player player = player(team, 7);
        assertThatThrownBy(() -> player(team, 7)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> teams.deleteById(team.getId())).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(teams.existsById(team.getId())).isTrue();
        assertThat(players.existsById(player.getId())).isTrue();
        String sql = "INSERT INTO volleyball.players " +
                "(id,first_name,last_name,jersey_number,position,team_id) VALUES (?,?,?,?,?,?)";
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "Marko", "Marković", 12, "SETTER", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "Marko", "Marković", 12, "SETTER", UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "Marko", "Marković", 0, "SETTER", team.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "Marko", "Marković", 12, "UNKNOWN", team.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(players.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"firstName", "lastName"})
    void validatesRequiredNamesUnicodeSeparatorsAndLength(String field) throws Exception {
        Team team = team("Team");
        var session = login(UserRole.STATISTICIAN);
        for (String value : new String[]{"", " ", null, "a".repeat(101), "Marko1", "Marko!", "-Marko", "Marko--Petar"}) {
            var data = input(7, PlayerPosition.SETTER);
            data.put(field, value);
            mvc.perform(post(path(team)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(data))).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors." + field).exists());
        }
        var missing = input(7, PlayerPosition.SETTER);
        missing.remove(field);
        mvc.perform(post(path(team)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(missing))).andExpect(status().isBadRequest());
        var valid = input(7, PlayerPosition.SETTER);
        valid.put(field, "  Ђорђе-Петар ");
        mvc.perform(post(path(team)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(valid))).andExpect(status().isCreated())
                .andExpect(jsonPath("$." + field).value("Ђорђе-Петар"));
    }

    @Test
    void rejectsMissingInvalidFractionalJerseyAndInvalidOrNumericPosition() throws Exception {
        Team team = team("Team");
        var session = login(UserRole.STATISTICIAN);
        for (Object number : new Object[]{null, 0, -1, 100, 1.5, "abc"}) {
            var data = input(7, PlayerPosition.SETTER);
            data.put("jerseyNumber", number);
            mvc.perform(post(path(team)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(data))).andExpect(status().isBadRequest());
        }
        for (Object position : new Object[]{null, "", "UNKNOWN", 0, 2}) {
            var data = input(7, PlayerPosition.SETTER);
            data.put("position", position);
            mvc.perform(post(path(team)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(data))).andExpect(status().isBadRequest());
        }
        for (String field : new String[]{"jerseyNumber", "position"}) {
            var missing = input(7, PlayerPosition.SETTER);
            missing.remove(field);
            mvc.perform(post(path(team)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(missing))).andExpect(status().isBadRequest());
        }
        assertThat(players.count()).isZero();
    }

    @Test
    void cannotReadUpdateOrDeleteAPlayerThroughAnotherTeam() throws Exception {
        Team first = team("First");
        Team second = team("Second");
        Player player = player(first, 7);
        String wrongPath = path(second) + "/" + player.getId();
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(get(wrongPath).session(session)).andExpect(status().isNotFound());
        mvc.perform(put(wrongPath).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(input(12, PlayerPosition.LIBERO))))
                .andExpect(status().isNotFound());
        mvc.perform(delete(wrongPath).session(session).with(csrf())).andExpect(status().isNotFound());
        assertThat(players.findById(player.getId()).orElseThrow().getJerseyNumber()).isEqualTo(7);
    }

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"COACH", "ADMIN"})
    void coachAndAdminCannotMutatePlayersAndAdminCannotReadThem(UserRole role) throws Exception {
        Team team = team("Team");
        Player player = player(team, 7);
        var session = login(role);
        mvc.perform(post(path(team)).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(input(12, PlayerPosition.LIBERO))))
                .andExpect(status().isForbidden());
        mvc.perform(put(path(team) + "/" + player.getId()).session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(input(12, PlayerPosition.LIBERO))))
                .andExpect(status().isForbidden());
        mvc.perform(delete(path(team) + "/" + player.getId()).session(session).with(csrf()))
                .andExpect(status().isForbidden());
        if (role == UserRole.ADMIN) {
            mvc.perform(get(path(team)).session(session)).andExpect(status().isForbidden());
            mvc.perform(get(path(team) + "/" + player.getId()).session(session)).andExpect(status().isForbidden());
        }
        assertThat(players.count()).isEqualTo(1);
    }

    @Test
    void anonymousAndMissingCsrfRequestsAreRejected() throws Exception {
        Team team = team("Team");
        Player player = player(team, 7);
        String data = mapper.writeValueAsString(input(12, PlayerPosition.LIBERO));
        mvc.perform(get(path(team))).andExpect(status().isUnauthorized());
        mvc.perform(get(path(team) + "/" + player.getId())).andExpect(status().isUnauthorized());
        mvc.perform(post(path(team)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(data))
                .andExpect(status().isUnauthorized());
        mvc.perform(put(path(team) + "/" + player.getId()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(data))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete(path(team) + "/" + player.getId()).with(csrf())).andExpect(status().isUnauthorized());
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(post(path(team)).session(session).contentType(MediaType.APPLICATION_JSON).content(data))
                .andExpect(status().isForbidden());
        mvc.perform(put(path(team) + "/" + player.getId()).session(session).contentType(MediaType.APPLICATION_JSON).content(data))
                .andExpect(status().isForbidden());
        mvc.perform(delete(path(team) + "/" + player.getId()).session(session)).andExpect(status().isForbidden());
        assertThat(players.count()).isEqualTo(1);
    }

    @Test
    void blockedStatisticianSessionCannotAccessPlayers() throws Exception {
        Team team = team("Team");
        var session = login(UserRole.STATISTICIAN);
        var user = users.findByEmail(email(UserRole.STATISTICIAN)).orElseThrow();
        user.block();
        users.saveAndFlush(user);
        mvc.perform(get(path(team)).session(session)).andExpect(status().isUnauthorized());
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void missingTeamAndPlayerMalformedIdsAndPaginationAreHandled() throws Exception {
        Team team = team("Team");
        Team other = team("Other");
        player(team, 12);
        player(team, 7);
        player(other, 1);
        var session = login(UserRole.STATISTICIAN);
        mvc.perform(get(path(team)).session(session).param("size", "1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content[0].jerseyNumber").value(7));
        mvc.perform(get(path(team)).session(session).param("size", "1").param("page", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].jerseyNumber").value(12));
        for (String size : new String[]{"0", "101", "invalid"}) {
            mvc.perform(get(path(team)).session(session).param("size", size)).andExpect(status().isBadRequest());
        }
        mvc.perform(get(path(team)).session(session).param("page", "-1")).andExpect(status().isBadRequest());
        String missingTeam = "/api/teams/" + UUID.randomUUID() + "/players";
        String data = mapper.writeValueAsString(input(7, PlayerPosition.SETTER));
        mvc.perform(get(missingTeam).session(session)).andExpect(status().isNotFound());
        mvc.perform(post(missingTeam).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(data))
                .andExpect(status().isNotFound());
        String missingPlayer = path(team) + "/" + UUID.randomUUID();
        mvc.perform(get(missingPlayer).session(session)).andExpect(status().isNotFound());
        mvc.perform(put(missingPlayer).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(data))
                .andExpect(status().isNotFound());
        mvc.perform(delete(missingPlayer).session(session).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(get("/api/teams/invalid/players").session(session)).andExpect(status().isBadRequest());
        mvc.perform(get(path(team) + "/invalid").session(session)).andExpect(status().isBadRequest());
    }

    @Test
    void concurrentCreationWithSameJerseyCreatesExactlyOnePlayer() throws Exception {
        Team team = team("Team");
        var request = new PlayerRequest("Marko", "Marković", 7, PlayerPosition.SETTER);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> create = () -> {
                start.await();
                try {
                    service.create(team.getId(), request);
                    return 201;
                } catch (ApiException exception) {
                    return 409;
                }
            };
            var first = executor.submit(create);
            var second = executor.submit(create);
            start.countDown();
            assertThat(java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 409);
        }
        assertThat(players.count()).isEqualTo(1);
    }
}
