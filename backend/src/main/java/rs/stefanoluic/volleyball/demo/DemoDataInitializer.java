package rs.stefanoluic.volleyball.demo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.match.Match;
import rs.stefanoluic.volleyball.match.MatchRepository;
import rs.stefanoluic.volleyball.match.roster.MatchRosterService;
import rs.stefanoluic.volleyball.match.roster.dto.MatchRosterRequest;
import rs.stefanoluic.volleyball.match.roster.dto.RosterPlayerRequest;
import rs.stefanoluic.volleyball.player.Player;
import rs.stefanoluic.volleyball.player.PlayerPosition;
import rs.stefanoluic.volleyball.player.PlayerRepository;
import rs.stefanoluic.volleyball.team.Team;
import rs.stefanoluic.volleyball.team.TeamRepository;
import rs.stefanoluic.volleyball.user.User;
import rs.stefanoluic.volleyball.user.UserRepository;
import rs.stefanoluic.volleyball.user.UserRole;
import rs.stefanoluic.volleyball.user.UserStatus;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

public class DemoDataInitializer implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DemoDataInitializer.class);
    private final UserRepository users;
    private final TeamRepository teams;
    private final PlayerRepository players;
    private final MatchRepository matches;
    private final MatchRosterService rosters;
    private final PasswordEncoder encoder;
    private final JdbcTemplate jdbc;
    private final DemoDataProperties properties;

    public DemoDataInitializer(UserRepository users, TeamRepository teams, PlayerRepository players,
            MatchRepository matches, MatchRosterService rosters, PasswordEncoder encoder,
            JdbcTemplate jdbc, DemoDataProperties properties) {
        this.users = users;
        this.teams = teams;
        this.players = players;
        this.matches = matches;
        this.rosters = rosters;
        this.encoder = encoder;
        this.jdbc = jdbc;
        this.properties = properties;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        // Serialize demo initialization and prevent inserts between the empty checks and seeding.
        // Ordinary reads remain possible; these startup-only locks are released on commit/rollback.
        jdbc.execute("LOCK TABLE volleyball.users, volleyball.teams, volleyball.players, volleyball.matches "
                + "IN SHARE ROW EXCLUSIVE MODE");
        if (users.count() > 0 || teams.count() > 0 || players.count() > 0 || matches.count() > 0) {
            log.info("Demo data skipped: database already contains application data. No existing data changed.");
            return;
        }

        account("Administrator", "admin.demo@example.com", UserRole.ADMIN);
        account("Statističar", "statistician.demo@example.com", UserRole.STATISTICIAN);
        account("Trener", "coach.demo@example.com", UserRole.COACH);
        Team home = teams.saveAndFlush(new Team("Demo Dunav", "Novi Sad"));
        Team away = teams.saveAndFlush(new Team("Demo Sava", "Beograd"));
        List<Player> homePlayers = squad(home, "Dunavski");
        List<Player> awayPlayers = squad(away, "Savski");
        var scheduled = LocalDate.now(ZoneOffset.UTC).plusDays(1).atTime(18, 0).toInstant(ZoneOffset.UTC);
        Match match = matches.saveAndFlush(new Match(home, away, scheduled));
        rosters.save(match.getId(), new MatchRosterRequest(0, selections(homePlayers), selections(awayPlayers)));
        log.info("Local demo created: three active accounts, two teams, eighteen players and one scheduled match with rosters.");
    }

    private void account(String firstName, String email, UserRole role) {
        users.saveAndFlush(new User(firstName, "Demo", email, encoder.encode(properties.password()), role, UserStatus.ACTIVE));
    }

    private List<Player> squad(Team team, String lastName) {
        String[] names = {"Marko", "Nikola", "Stefan", "Luka", "Milan", "Petar", "Ivan", "Vuk", "Filip"};
        PlayerPosition[] positions = {PlayerPosition.SETTER, PlayerPosition.OUTSIDE_HITTER, PlayerPosition.MIDDLE_BLOCKER,
                PlayerPosition.OPPOSITE, PlayerPosition.OUTSIDE_HITTER, PlayerPosition.MIDDLE_BLOCKER,
                PlayerPosition.SETTER, PlayerPosition.OUTSIDE_HITTER, PlayerPosition.LIBERO};
        List<Player> squad = new ArrayList<>();
        for (int i = 0; i < names.length; i++) squad.add(new Player(team, names[i], lastName, i + 1, positions[i]));
        return players.saveAllAndFlush(squad);
    }

    private List<RosterPlayerRequest> selections(List<Player> squad) {
        return squad.stream().map(player -> new RosterPlayerRequest(player.getId(), player.getPosition() == PlayerPosition.LIBERO)).toList();
    }
}
