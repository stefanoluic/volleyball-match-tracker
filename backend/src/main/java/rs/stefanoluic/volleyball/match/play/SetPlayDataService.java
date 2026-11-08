package rs.stefanoluic.volleyball.match.play;

import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.match.MatchStatus;
import rs.stefanoluic.volleyball.match.play.libero.LiberoReplacementRepository;
import rs.stefanoluic.volleyball.match.play.score.SetPointRepository;
import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitutionRepository;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import java.util.List;

@Service
public class SetPlayDataService {
    private final SetLineupRepository lineups;
    private final SetPointRepository points;
    private final SetSubstitutionRepository substitutions;
    private final LiberoReplacementRepository liberos;
    private final MatchPlayerRepository participants;

    public SetPlayDataService(SetLineupRepository lineups, SetPointRepository points,
                              SetSubstitutionRepository substitutions, LiberoReplacementRepository liberos,
                              MatchPlayerRepository participants) {
        this.lineups = lineups; this.points = points; this.substitutions = substitutions;
        this.liberos = liberos; this.participants = participants;
    }

    public SetPlayData load(MatchSet set) {
        boolean canChangeLineup = set.getStatus() == MatchSetStatus.LIVE
                && set.getMatch().getStatus() == MatchStatus.LIVE && !set.hasWinningScore();
        return new SetPlayData(lineups.findBySetIdOrderByRotationPositionAsc(set.getId()),
                points.findBySetIdAndCancelledAtIsNullOrderBySequenceNumberAsc(set.getId()),
                substitutions.findBySetIdAndCancelledAtIsNullOrderByExpectedVersionAsc(set.getId()),
                liberos.findBySetIdAndCancelledAtIsNullOrderByExpectedVersionAsc(set.getId()),
                canChangeLineup ? participants.findByMatchIdOrderByJerseyNumberAscIdAsc(set.getMatch().getId()) : List.of());
    }
}
