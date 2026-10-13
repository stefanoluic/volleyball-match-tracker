package rs.stefanoluic.volleyball.match.roster;

import jakarta.persistence.*;
import rs.stefanoluic.volleyball.match.Match;
import rs.stefanoluic.volleyball.player.Player;
import rs.stefanoluic.volleyball.player.PlayerPosition;
import rs.stefanoluic.volleyball.team.Team;

import java.util.UUID;

@Entity
@Table(name = "match_players", schema = "volleyball")
public class MatchPlayer {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "match_id", nullable = false)
    private Match match;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false)
    private Player player;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Column(name = "jersey_number", nullable = false)
    private int jerseyNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PlayerPosition position;

    @Column(name = "is_libero", nullable = false)
    private boolean libero;

    protected MatchPlayer() {}

    public MatchPlayer(Match match, Team team, Player player, boolean libero) {
        this.match = match;
        this.team = team;
        this.player = player;
        firstName = player.getFirstName();
        lastName = player.getLastName();
        jerseyNumber = player.getJerseyNumber();
        position = player.getPosition();
        this.libero = libero;
    }

    public void designateLibero(boolean libero) { this.libero = libero; }
    public UUID getId() { return id; }
    public Player getPlayer() { return player; }
    public Team getTeam() { return team; }
    public String getFirstName() { return firstName; }
    public String getLastName() { return lastName; }
    public int getJerseyNumber() { return jerseyNumber; }
    public PlayerPosition getPosition() { return position; }
    public boolean isLibero() { return libero; }
}
