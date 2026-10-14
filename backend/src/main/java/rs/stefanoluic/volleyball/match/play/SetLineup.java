package rs.stefanoluic.volleyball.match.play;

import jakarta.persistence.*;
import rs.stefanoluic.volleyball.match.Match;
import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import rs.stefanoluic.volleyball.team.Team;
import java.util.UUID;

@Entity
@Table(name = "set_lineups", schema = "volleyball")
public class SetLineup {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "set_id", nullable = false)
    private MatchSet set;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "match_id", nullable = false)
    private Match match;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "match_player_id", nullable = false)
    private MatchPlayer participant;
    @Column(name = "rotation_position", nullable = false)
    private int rotationPosition;

    protected SetLineup() {}
    public SetLineup(MatchSet set, Match match, MatchPlayer participant, int rotationPosition) {
        this.set = set;
        this.match = match;
        this.participant = participant;
        this.team = participant.getTeam();
        this.rotationPosition = rotationPosition;
    }
    public MatchPlayer getParticipant() { return participant; }
    public int getRotationPosition() { return rotationPosition; }
}
