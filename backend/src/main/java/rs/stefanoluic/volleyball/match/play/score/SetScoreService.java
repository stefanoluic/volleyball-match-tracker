package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.*;
import rs.stefanoluic.volleyball.match.play.*;
import rs.stefanoluic.volleyball.match.play.score.dto.*;
import rs.stefanoluic.volleyball.match.play.substitution.SubstitutionViewService;
import rs.stefanoluic.volleyball.match.play.libero.LiberoViewService;
import java.util.UUID;
import java.util.Objects;

@Service
public class SetScoreService {
    private final MatchRepository matches;
    private final MatchSetRepository sets;
    private final SetPointRepository points;
    private final SetCourtService court;
    private final SetPlayDataService playData;
    private final SetPlayOrderService order;
    private final SubstitutionViewService substitutionView;
    private final LiberoViewService liberoView;
    private final PointDetailsService details;
    public SetScoreService(MatchRepository matches, MatchSetRepository sets, SetPointRepository points, SetCourtService court,
                           SetPlayOrderService order, SubstitutionViewService substitutionView, LiberoViewService liberoView,
                           PointDetailsService details, SetPlayDataService playData) {
        this.matches = matches; this.sets = sets; this.points = points; this.court = court;
        this.order = order; this.substitutionView = substitutionView; this.liberoView = liberoView;
        this.details = details;
        this.playData = playData;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SetScoreResponse get(UUID matchId, UUID setId) {
        matches.findById(matchId).orElseThrow(SetScoreService::matchNotFound);
        return response(findSet(matchId, setId));
    }
    @Transactional
    public SetScoreResponse add(UUID matchId, UUID setId, AddPointRequest request) {
        Match match = lock(matchId);
        MatchSet set = findSet(matchId, setId);
        // A retry of an already committed command returns current state, even after later changes.
        SetPoint existing = points.findBySetIdAndRequestId(setId, request.requestId()).orElse(null);
        if (existing != null) {
            if (!existing.getScoringTeam().getId().equals(request.scoringTeamId())
                    || existing.getActionType() != request.actionType()
                    || !Objects.equals(existing.getParticipant() == null ? null : existing.getParticipant().getId(), request.participantId())
                    || existing.getExpectedVersion() != request.version()) throw reusedKey();
            return response(set);
        }
        requireLive(match, set);
        requireVersion(set, request.version());
        if (set.hasWinningScore()) throw new ApiException(HttpStatus.CONFLICT,
                "Postignut je rezultat za kraj seta. Potvrdite kraj ili poništite pogrešan završni poen.");
        var data = playData.load(set);
        var layout = court.get(set, true, data);
        if (liberoView.requiresExit(set, layout, data)) throw new ApiException(HttpStatus.CONFLICT,
                "Pre narednog poena vratite zamenjenog igrača: libero ne sme biti u prednjoj liniji ili na servisu.");
        boolean home = match.getHomeTeam().getId().equals(request.scoringTeamId());
        if (!home && !match.getAwayTeam().getId().equals(request.scoringTeamId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Poen mora pripadati jednom od timova ove utakmice.");
        }
        var participant = details.validate(match, request, layout);
        set.recordPoint(home);
        points.saveAndFlush(new SetPoint(set, home ? match.getHomeTeam() : match.getAwayTeam(),
                request.requestId(), request.version(), request.actionType(), participant));
        sets.flush();
        return response(set);
    }
    @Transactional
    public SetScoreResponse undo(UUID matchId, UUID setId, UUID pointId, UndoPointRequest request) {
        Match match = lock(matchId);
        MatchSet set = findSet(matchId, setId);
        SetPoint existing = points.findBySetIdAndUndoRequestId(setId, request.requestId()).orElse(null);
        if (existing != null) {
            if (!existing.getId().equals(pointId) || !existing.getUndoExpectedVersion().equals(request.version())) throw reusedKey();
            return response(set);
        }
        requireLive(match, set);
        requireVersion(set, request.version());
        SetPoint point = points.findByIdAndSetId(pointId, setId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Poen nije pronađen u ovom setu."));
        SetPoint last = points.findFirstBySetIdAndCancelledAtIsNullOrderBySequenceNumberDesc(setId).orElse(null);
        if (last == null || !last.getId().equals(pointId)) {
            throw new ApiException(HttpStatus.CONFLICT, "Možete poništiti samo poslednji važeći poen. Osvežite rezultat.");
        }
        if (order.hasChangeAfter(setId, point.getExpectedVersion()))
            throw new ApiException(HttpStatus.CONFLICT, "Prvo poništite promenu postave koja je uneta posle ovog poena.");
        set.cancelPoint(point.getScoringTeam().getId().equals(match.getHomeTeam().getId()));
        point.cancel(request.requestId(), request.version());
        points.flush(); sets.flush();
        return response(set);
    }
    private SetScoreResponse response(MatchSet set) {
        var data = playData.load(set);
        var lastPoint = data.lastPoint();
        var latest = lastPoint == null ? null : PointResponse.from(lastPoint);
        var recent = points.findBySetIdOrderBySequenceNumberDesc(set.getId(), PageRequest.of(0, 20))
                .stream().map(PointResponse::from).toList();
        boolean live = set.getStatus() == MatchSetStatus.LIVE && set.getMatch().getStatus() == MatchStatus.LIVE;
        var layout = court.get(set, live && !set.hasWinningScore(), data);
        var libero = liberoView.get(set, layout, data);
        var changes = substitutionView.get(set, layout, data, libero.mustExit());
        if (layout != null && libero.mustExit()) layout = new SetCourtResponse(null, null, layout.homeLineup(), layout.awayLineup());
        return new SetScoreResponse(set.getId(), set.getScoreVersion(), set.getHomeScore(), set.getAwayScore(),
                set.getMatch().getStatus(), set.getStatus(), live && !set.hasWinningScore() && !libero.mustExit(), latest, recent,
                live && latest != null && !changes.pointUndoBlocked(), live && set.hasWinningScore(), set.getWinningTeamId(),
                layout, changes, libero);
    }
    private Match lock(UUID id) { return matches.findByIdForUpdate(id).orElseThrow(SetScoreService::matchNotFound); }
    private MatchSet findSet(UUID matchId, UUID setId) {
        return sets.findByIdAndMatchId(setId, matchId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Set nije pronađen u ovoj utakmici."));
    }
    private static void requireLive(Match match, MatchSet set) {
        if (match.getStatus() != MatchStatus.LIVE || set.getStatus() != MatchSetStatus.LIVE) {
            throw new ApiException(HttpStatus.CONFLICT, "Poeni se menjaju samo dok su utakmica i set u toku. Osvežite rezultat.");
        }
    }
    private static void requireVersion(MatchSet set, int version) {
        if (set.getScoreVersion() != version) throw new ApiException(HttpStatus.CONFLICT,
                "Rezultat je u međuvremenu promenjen. Osvežite ga pre sledećeg unosa.");
    }
    private static ApiException matchNotFound() { return new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena."); }
    private static ApiException reusedKey() { return new ApiException(HttpStatus.CONFLICT, "Identifikator zahteva je već korišćen za drugačiji unos."); }
}
