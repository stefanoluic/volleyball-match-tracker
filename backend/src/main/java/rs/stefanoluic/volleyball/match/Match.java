package rs.stefanoluic.volleyball.match;

import jakarta.persistence.*;
import rs.stefanoluic.volleyball.team.Team;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "matches", schema = "volleyball")
public class Match {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "home_team_id", nullable = false)
    private Team homeTeam;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "away_team_id", nullable = false)
    private Team awayTeam;

    @Column(name = "scheduled_at", nullable = false)
    private Instant scheduledAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MatchStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Match() {}

    public Match(Team homeTeam, Team awayTeam, Instant scheduledAt) {
        update(homeTeam, awayTeam, scheduledAt);
        status = MatchStatus.SCHEDULED;
        createdAt = Instant.now();
    }

    public void update(Team homeTeam, Team awayTeam, Instant scheduledAt) {
        this.homeTeam = Objects.requireNonNull(homeTeam);
        this.awayTeam = Objects.requireNonNull(awayTeam);
        this.scheduledAt = Objects.requireNonNull(scheduledAt);
    }

    public UUID getId() { return id; }
    public Team getHomeTeam() { return homeTeam; }
    public Team getAwayTeam() { return awayTeam; }
    public Instant getScheduledAt() { return scheduledAt; }
    public MatchStatus getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
