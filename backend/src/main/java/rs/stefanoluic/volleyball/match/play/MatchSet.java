package rs.stefanoluic.volleyball.match.play;

import jakarta.persistence.*;
import rs.stefanoluic.volleyball.match.Match;
import rs.stefanoluic.volleyball.team.Team;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "match_sets", schema = "volleyball")
public class MatchSet {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "match_id", nullable = false)
    private Match match;
    @Column(name = "set_number", nullable = false)
    private int number;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private MatchSetStatus status;
    @Column(name = "home_score", nullable = false)
    private int homeScore;
    @Column(name = "away_score", nullable = false)
    private int awayScore;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "first_serving_team_id", nullable = false)
    private Team firstServingTeam;
    @Column(name = "started_at", nullable = false)
    private Instant startedAt;
    @Column(name = "score_version", nullable = false)
    private int scoreVersion;
    @Column(name = "last_point_sequence", nullable = false)
    private int lastPointSequence;
    @Column(name = "finished_at")
    private Instant finishedAt;
    @Column(name = "finish_request_id")
    private UUID finishRequestId;
    @Column(name = "finish_expected_version")
    private Integer finishExpectedVersion;

    protected MatchSet() {}
    public MatchSet(Match match, int number, Team firstServingTeam) {
        this.match = match;
        this.number = number;
        this.firstServingTeam = firstServingTeam;
        status = MatchSetStatus.LIVE;
        startedAt = Instant.now();
    }
    public UUID getId() { return id; }
    public Match getMatch() { return match; }
    public int getScoreVersion() { return scoreVersion; }
    public int getLastPointSequence() { return lastPointSequence; }
    public int getTargetScore() { return number == 5 ? 15 : 25; }
    public boolean hasWinningScore() {
        return Math.max(homeScore, awayScore) >= getTargetScore() && Math.abs((long) homeScore - awayScore) >= 2;
    }
    public UUID getWinningTeamId() {
        if (!hasWinningScore()) return null;
        return (homeScore > awayScore ? match.getHomeTeam() : match.getAwayTeam()).getId();
    }
    public Instant getFinishedAt() { return finishedAt; }
    public UUID getFinishRequestId() { return finishRequestId; }
    public Integer getFinishExpectedVersion() { return finishExpectedVersion; }
    public void finish(UUID requestId, int expectedVersion) {
        if (status != MatchSetStatus.LIVE || !hasWinningScore()) throw new IllegalStateException("Set cannot finish.");
        status = MatchSetStatus.FINISHED;
        finishedAt = Instant.now();
        finishRequestId = requestId;
        finishExpectedVersion = expectedVersion;
        scoreVersion++;
    }
    public void recordPoint(boolean home) {
        if (home) homeScore++; else awayScore++;
        lastPointSequence++;
        scoreVersion++;
    }
    public void cancelPoint(boolean home) {
        if ((home ? homeScore : awayScore) < 1) throw new IllegalStateException("Score cannot be negative.");
        if (home) homeScore--; else awayScore--;
        scoreVersion++;
    }
    public int getNumber() { return number; }
    public MatchSetStatus getStatus() { return status; }
    public int getHomeScore() { return homeScore; }
    public int getAwayScore() { return awayScore; }
    public Team getFirstServingTeam() { return firstServingTeam; }
    public Instant getStartedAt() { return startedAt; }
}
