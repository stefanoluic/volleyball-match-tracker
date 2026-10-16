package rs.stefanoluic.volleyball.match.play.libero;

import jakarta.persistence.*;
import rs.stefanoluic.volleyball.match.play.MatchSet;
import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "libero_replacements", schema = "volleyball")
public class LiberoReplacement {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "set_id") private MatchSet set;
    @Column(name = "match_id", nullable = false) private UUID matchId;
    @Column(name = "team_id", nullable = false) private UUID teamId;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "outgoing_participant_id") private MatchPlayer outgoing;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "incoming_participant_id") private MatchPlayer incoming;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "regular_participant_id") private MatchPlayer regular;
    @Column(name = "starting_position", nullable = false) private int startingPosition;
    @Column(name = "request_id", nullable = false) private UUID requestId;
    @Column(name = "expected_version", nullable = false) private int expectedVersion;
    @Column(name = "after_point_sequence", nullable = false) private int afterPointSequence;
    @Column(name = "home_score", nullable = false) private int homeScore;
    @Column(name = "away_score", nullable = false) private int awayScore;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "undo_request_id") private UUID undoRequestId;
    @Column(name = "undo_expected_version") private Integer undoExpectedVersion;

    protected LiberoReplacement() {}
    public LiberoReplacement(MatchSet set, MatchPlayer outgoing, MatchPlayer incoming, MatchPlayer regular,
                             int startingPosition, UUID requestId, int expectedVersion, int afterPointSequence) {
        this.set = set; this.matchId = set.getMatch().getId(); this.teamId = outgoing.getTeam().getId();
        this.outgoing = outgoing; this.incoming = incoming; this.regular = regular; this.startingPosition = startingPosition;
        this.requestId = requestId; this.expectedVersion = expectedVersion; this.afterPointSequence = afterPointSequence;
        this.homeScore = set.getHomeScore(); this.awayScore = set.getAwayScore(); this.createdAt = Instant.now();
    }
    public void cancel(UUID requestId, int version) {
        if (cancelledAt != null) throw new IllegalStateException("Libero replacement already cancelled.");
        cancelledAt = Instant.now(); undoRequestId = requestId; undoExpectedVersion = version;
    }
    public UUID getId() { return id; }
    public UUID getTeamId() { return teamId; }
    public MatchPlayer getOutgoing() { return outgoing; }
    public MatchPlayer getIncoming() { return incoming; }
    public MatchPlayer getRegular() { return regular; }
    public int getStartingPosition() { return startingPosition; }
    public int getExpectedVersion() { return expectedVersion; }
    public int getAfterPointSequence() { return afterPointSequence; }
    public int getHomeScore() { return homeScore; }
    public int getAwayScore() { return awayScore; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public Integer getUndoExpectedVersion() { return undoExpectedVersion; }
}
