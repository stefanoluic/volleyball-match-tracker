package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.*;
import rs.stefanoluic.volleyball.match.play.*;
import rs.stefanoluic.volleyball.match.play.score.dto.*;
import java.util.UUID;
import java.util.Objects;

@Service
public class SetScoreService {
    private final MatchRepository matches;
    private final MatchSetRepository sets;
    private final SetPointRepository points;
    private final SetScoreViewService view;
    private final SetPlayOrderService order;
    private final PointDetailsService details;
    public SetScoreService(MatchRepository matches, MatchSetRepository sets, SetPointRepository points,
                           SetScoreViewService view, SetPlayOrderService order, PointDetailsService details) {
        this.matches = matches; this.sets = sets; this.points = points; this.view = view;
        this.order = order;
        this.details = details;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SetScoreResponse get(UUID matchId, UUID setId) {
        return view.get(matchId, setId);
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
            return view.response(set);
        }
        requireLive(match, set);
        requireVersion(set, request.version());
        if (set.hasWinningScore()) throw new ApiException(HttpStatus.CONFLICT,
                "Postignut je rezultat za kraj seta. Potvrdite kraj ili poništite pogrešan završni poen.");
        var layout = view.courtBeforePoint(set);
        boolean home = match.getHomeTeam().getId().equals(request.scoringTeamId());
        if (!home && !match.getAwayTeam().getId().equals(request.scoringTeamId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Poen mora pripadati jednom od timova ove utakmice.");
        }
        var participant = details.validate(match, request, layout);
        set.recordPoint(home);
        points.saveAndFlush(new SetPoint(set, home ? match.getHomeTeam() : match.getAwayTeam(),
                request.requestId(), request.version(), request.actionType(), participant));
        sets.flush();
        return view.response(set);
    }
    @Transactional
    public SetScoreResponse undo(UUID matchId, UUID setId, UUID pointId, UndoPointRequest request) {
        Match match = lock(matchId);
        MatchSet set = findSet(matchId, setId);
        SetPoint existing = points.findBySetIdAndUndoRequestId(setId, request.requestId()).orElse(null);
        if (existing != null) {
            if (!existing.getId().equals(pointId) || !existing.getUndoExpectedVersion().equals(request.version())) throw reusedKey();
            return view.response(set);
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
        return view.response(set);
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
