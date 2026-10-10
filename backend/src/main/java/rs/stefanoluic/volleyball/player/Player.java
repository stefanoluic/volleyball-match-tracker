package rs.stefanoluic.volleyball.player;

import jakarta.persistence.*;
import rs.stefanoluic.volleyball.team.Team;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "players", schema = "volleyball")
public class Player {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Column(name = "jersey_number", nullable = false)
    private int jerseyNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PlayerPosition position;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Player() {
    }

    public Player(Team team, String firstName, String lastName, int jerseyNumber, PlayerPosition position) {
        this.team = Objects.requireNonNull(team);
        update(firstName, lastName, jerseyNumber, position);
        createdAt = Instant.now();
    }

    public void update(String firstName, String lastName, int jerseyNumber, PlayerPosition position) {
        this.firstName = Objects.requireNonNull(Team.normalizeText(firstName));
        this.lastName = Objects.requireNonNull(Team.normalizeText(lastName));
        this.jerseyNumber = jerseyNumber;
        this.position = Objects.requireNonNull(position);
    }

    public UUID getId() { return id; }
    public String getFirstName() { return firstName; }
    public String getLastName() { return lastName; }
    public int getJerseyNumber() { return jerseyNumber; }
    public PlayerPosition getPosition() { return position; }
    public Team getTeam() { return team; }
    public Instant getCreatedAt() { return createdAt; }
}
