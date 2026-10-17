package rs.stefanoluic.volleyball.match.play.score;

import jakarta.persistence.*;
import rs.stefanoluic.volleyball.match.play.MatchSet;
import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import rs.stefanoluic.volleyball.team.Team;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "set_points", schema = "volleyball")
public class SetPoint {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "set_id", nullable = false)
    private MatchSet set;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "scoring_team_id", nullable = false)
    private Team scoringTeam;
    @Column(name = "match_id", nullable = false)
    private UUID matchId;
    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false, length = 30)
    private PointActionType actionType;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "participant_id")
    private MatchPlayer participant;
    @Column(name = "participant_team_id")
    private UUID participantTeamId;
    @Column(name = "sequence_number", nullable = false)
    private int sequenceNumber;
    @Column(name = "request_id", nullable = false)
    private UUID requestId;
    @Column(name = "expected_version", nullable = false)
    private int expectedVersion;
    @Column(name = "home_score_after", nullable = false)
    private int homeScoreAfter;
    @Column(name = "away_score_after", nullable = false)
    private int awayScoreAfter;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "cancelled_at")
    private Instant cancelledAt;
    @Column(name = "undo_request_id")
    private UUID undoRequestId;
    @Column(name = "undo_expected_version")
    private Integer undoExpectedVersion;

    protected SetPoint() {}
    public SetPoint(MatchSet set, Team scoringTeam, UUID requestId, int expectedVersion) {
        this(set, scoringTeam, requestId, expectedVersion, PointActionType.UNSPECIFIED, null);
    }
    public SetPoint(MatchSet set, Team scoringTeam, UUID requestId, int expectedVersion,
                    PointActionType actionType, MatchPlayer participant) {
        this.set = set;
        this.scoringTeam = scoringTeam;
        this.matchId = set.getMatch().getId();
        this.actionType = actionType;
        this.participant = participant;
        this.participantTeamId = participant == null ? null : participant.getTeam().getId();
        this.requestId = requestId;
        this.expectedVersion = expectedVersion;
        sequenceNumber = set.getLastPointSequence();
        homeScoreAfter = set.getHomeScore();
        awayScoreAfter = set.getAwayScore();
        createdAt = Instant.now();
    }
    public void cancel(UUID requestId, int expectedVersion) {
        if (cancelledAt != null) throw new IllegalStateException("Point has already been cancelled.");
        cancelledAt = Instant.now();
        undoRequestId = requestId;
        undoExpectedVersion = expectedVersion;
    }
    public UUID getId() { return id; }
    public Team getScoringTeam() { return scoringTeam; }
    public PointActionType getActionType() { return actionType; }
    public MatchPlayer getParticipant() { return participant; }
    public int getSequenceNumber() { return sequenceNumber; }
    public int getExpectedVersion() { return expectedVersion; }
    public Integer getUndoExpectedVersion() { return undoExpectedVersion; }
    public int getHomeScoreAfter() { return homeScoreAfter; }
    public int getAwayScoreAfter() { return awayScoreAfter; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getCancelledAt() { return cancelledAt; }
}
