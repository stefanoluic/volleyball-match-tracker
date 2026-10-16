package rs.stefanoluic.volleyball.match.play.substitution;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.*;
import rs.stefanoluic.volleyball.match.play.*;
import rs.stefanoluic.volleyball.match.play.score.*;
import rs.stefanoluic.volleyball.match.play.score.dto.*;
import rs.stefanoluic.volleyball.match.play.substitution.dto.SubstituteRequest;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import java.util.UUID;

@Service
public class SetSubstitutionService {
    private final MatchRepository matches;
    private final MatchSetRepository sets;
    private final SetSubstitutionRepository substitutions;
    private final MatchPlayerRepository participants;
    private final SetPointRepository points;
    private final SetScoreService scores;

    public SetSubstitutionService(MatchRepository matches, MatchSetRepository sets, SetSubstitutionRepository substitutions,
                                  MatchPlayerRepository participants, SetPointRepository points, SetScoreService scores) {
        this.matches = matches; this.sets = sets; this.substitutions = substitutions;
        this.participants = participants; this.points = points; this.scores = scores;
    }

    @Transactional
    public SetScoreResponse add(UUID matchId, UUID setId, SubstituteRequest request) {
        MatchSet set = lock(matchId, setId);
        var existing = substitutions.findBySetIdAndRequestId(setId, request.requestId()).orElse(null);
        if (existing != null) {
            if (existing.getExpectedVersion() != request.version()
                    || !existing.getOutgoing().getId().equals(request.outgoingParticipantId())
                    || !existing.getIncoming().getId().equals(request.incomingParticipantId())) throw conflict("Identifikator zahteva je već korišćen za drugu izmenu.");
            return scores.get(matchId, setId);
        }
        requireLive(set, request.version());
        if (set.hasWinningScore()) throw conflict("Izmena nije dozvoljena posle završnog poena seta.");
        var state = scores.get(matchId, setId);
        var option = state.substitutions().options().stream()
                .filter(row -> row.outgoing().id().equals(request.outgoingParticipantId())
                        && row.incoming().stream().anyMatch(player -> player.id().equals(request.incomingParticipantId())))
                .findFirst().orElseThrow(() -> conflict("Izmena nije dozvoljena. Proverite sastav, broj izmena, par igrača i da li je odigran poen od prethodne izmene tog tima."));
        var outgoing = participants.findById(request.outgoingParticipantId()).orElseThrow(() -> conflict("Igrač nije pronađen."));
        var incoming = participants.findById(request.incomingParticipantId()).orElseThrow(() -> conflict("Igrač nije pronađen."));
        int afterPoint = points.findFirstBySetIdAndCancelledAtIsNullOrderBySequenceNumberDesc(setId)
                .map(SetPoint::getSequenceNumber).orElse(0);
        substitutions.saveAndFlush(new SetSubstitution(set, outgoing, incoming, option.startingPosition(),
                request.requestId(), request.version(), afterPoint));
        set.advancePlayVersion(); sets.flush();
        return scores.get(matchId, setId);
    }

    @Transactional
    public SetScoreResponse undo(UUID matchId, UUID setId, UUID substitutionId, UndoPointRequest request) {
        MatchSet set = lock(matchId, setId);
        var existing = substitutions.findBySetIdAndUndoRequestId(setId, request.requestId()).orElse(null);
        if (existing != null) {
            if (!existing.getId().equals(substitutionId) || !request.version().equals(existing.getUndoExpectedVersion()))
                throw conflict("Identifikator zahteva je već korišćen za drugo poništavanje.");
            return scores.get(matchId, setId);
        }
        requireLive(set, request.version());
        var row = substitutions.findByIdAndSetId(substitutionId, setId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Izmena nije pronađena u ovom setu."));
        if (!substitutionId.equals(scores.get(matchId, setId).substitutions().undoableId()))
            throw conflict("Prvo poništite kasnije poene ili izmene. Ispravke se rade obrnutim redosledom.");
        row.cancel(request.requestId(), request.version());
        set.advancePlayVersion(); substitutions.flush(); sets.flush();
        return scores.get(matchId, setId);
    }

    private MatchSet lock(UUID matchId, UUID setId) {
        matches.findByIdForUpdate(matchId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena."));
        return sets.findByIdAndMatchId(setId, matchId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Set nije pronađen u ovoj utakmici."));
    }
    private void requireLive(MatchSet set, int version) {
        if (set.getStatus() != MatchSetStatus.LIVE || set.getMatch().getStatus() != MatchStatus.LIVE)
            throw conflict("Izmene su dozvoljene samo u setu i utakmici koji su u toku.");
        if (set.getScoreVersion() != version) throw conflict("Stanje seta je promenjeno. Osvežite ga pre izmene.");
    }
    private static ApiException conflict(String message) { return new ApiException(HttpStatus.CONFLICT, message); }
}
