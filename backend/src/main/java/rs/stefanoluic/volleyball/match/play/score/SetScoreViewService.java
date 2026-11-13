package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.MatchRepository;
import rs.stefanoluic.volleyball.match.MatchStatus;
import rs.stefanoluic.volleyball.match.play.*;
import rs.stefanoluic.volleyball.match.play.libero.LiberoViewService;
import rs.stefanoluic.volleyball.match.play.score.dto.*;
import rs.stefanoluic.volleyball.match.play.substitution.SubstitutionViewService;
import java.util.UUID;

@Service
public class SetScoreViewService {
    private final MatchRepository matches;
    private final MatchSetRepository sets;
    private final SetPointRepository points;
    private final SetPlayDataService playData;
    private final SetCourtService court;
    private final SubstitutionViewService substitutions;
    private final LiberoViewService liberos;

    public SetScoreViewService(MatchRepository matches, MatchSetRepository sets, SetPointRepository points,
                               SetPlayDataService playData, SetCourtService court,
                               SubstitutionViewService substitutions, LiberoViewService liberos) {
        this.matches = matches;
        this.sets = sets;
        this.points = points;
        this.playData = playData;
        this.court = court;
        this.substitutions = substitutions;
        this.liberos = liberos;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SetScoreResponse get(UUID matchId, UUID setId) {
        matches.findById(matchId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena."));
        var set = sets.findByIdAndMatchId(setId, matchId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Set nije pronađen u ovoj utakmici."));
        return response(set);
    }

    // Commands call these methods inside their existing transaction, including after a flush.
    public SetCourtResponse courtBeforePoint(MatchSet set) {
        var data = playData.load(set);
        var layout = court.get(set, true, data);
        if (liberos.requiresExit(set, layout, data)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Pre narednog poena vratite zamenjenog igrača: libero ne sme biti u prednjoj liniji ili na servisu.");
        }
        return layout;
    }

    public SetScoreResponse response(MatchSet set) {
        var data = playData.load(set);
        var lastPoint = data.lastPoint();
        var latest = lastPoint == null ? null : PointResponse.from(lastPoint);
        var recent = points.findBySetIdOrderBySequenceNumberDesc(set.getId(), PageRequest.of(0, 20))
                .stream().map(PointResponse::from).toList();
        boolean live = set.getStatus() == MatchSetStatus.LIVE && set.getMatch().getStatus() == MatchStatus.LIVE;
        var layout = court.get(set, live && !set.hasWinningScore(), data);
        var libero = liberos.get(set, layout, data);
        var changes = substitutions.get(set, layout, data, libero.mustExit());
        if (layout != null && libero.mustExit()) {
            layout = new SetCourtResponse(null, null, layout.homeLineup(), layout.awayLineup());
        }
        return new SetScoreResponse(set.getId(), set.getScoreVersion(), set.getHomeScore(), set.getAwayScore(),
                set.getMatch().getStatus(), set.getStatus(), live && !set.hasWinningScore() && !libero.mustExit(), latest, recent,
                live && latest != null && !changes.pointUndoBlocked(), live && set.hasWinningScore(), set.getWinningTeamId(),
                layout, changes, libero);
    }
}
