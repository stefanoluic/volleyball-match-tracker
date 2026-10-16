package rs.stefanoluic.volleyball.match.play.libero;

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
public class LiberoReplacementService {
    private final MatchRepository matches;
    private final MatchSetRepository sets;
    private final LiberoReplacementRepository replacements;
    private final MatchPlayerRepository participants;
    private final SetPointRepository points;
    private final SetScoreService scores;
    public LiberoReplacementService(MatchRepository matches, MatchSetRepository sets, LiberoReplacementRepository replacements,
                                     MatchPlayerRepository participants, SetPointRepository points, SetScoreService scores) {
        this.matches = matches; this.sets = sets; this.replacements = replacements;
        this.participants = participants; this.points = points; this.scores = scores;
    }
    @Transactional
    public SetScoreResponse add(UUID matchId, UUID setId, SubstituteRequest request) {
        MatchSet set = lock(matchId, setId);
        var existing = replacements.findBySetIdAndRequestId(setId, request.requestId()).orElse(null);
        if (existing != null) {
            if (existing.getExpectedVersion() != request.version() || !existing.getOutgoing().getId().equals(request.outgoingParticipantId())
                    || !existing.getIncoming().getId().equals(request.incomingParticipantId())) throw conflict("Identifikator zahteva je već korišćen za drugu zamenu libera.");
            return scores.get(matchId, setId);
        }
        requireLive(set, request.version());
        if (set.hasWinningScore()) throw conflict("Zamena libera nije dozvoljena posle završnog poena.");
        var option = scores.get(matchId, setId).libero().options().stream()
                .filter(row -> row.outgoing().id().equals(request.outgoingParticipantId())
                        && row.incoming().stream().anyMatch(player -> player.id().equals(request.incomingParticipantId())))
                .findFirst().orElseThrow(() -> conflict("Zamena libera nije dozvoljena. Proverite zadnju liniju, servis, zamenjenog igrača i poen između dve zamene libera."));
        var outgoing = participants.findById(request.outgoingParticipantId()).orElseThrow();
        var incoming = participants.findById(request.incomingParticipantId()).orElseThrow();
        var regular = participants.findById(option.regularParticipantId()).orElseThrow();
        int afterPoint = points.findFirstBySetIdAndCancelledAtIsNullOrderBySequenceNumberDesc(setId).map(SetPoint::getSequenceNumber).orElse(0);
        replacements.saveAndFlush(new LiberoReplacement(set, outgoing, incoming, regular, option.startingPosition(),
                request.requestId(), request.version(), afterPoint));
        set.advancePlayVersion(); sets.flush();
        return scores.get(matchId, setId);
    }
    @Transactional
    public SetScoreResponse undo(UUID matchId, UUID setId, UUID replacementId, UndoPointRequest request) {
        MatchSet set = lock(matchId, setId);
        var existing = replacements.findBySetIdAndUndoRequestId(setId, request.requestId()).orElse(null);
        if (existing != null) {
            if (!existing.getId().equals(replacementId) || !request.version().equals(existing.getUndoExpectedVersion()))
                throw conflict("Identifikator zahteva je već korišćen za drugo poništavanje.");
            return scores.get(matchId, setId);
        }
        requireLive(set, request.version());
        var row = replacements.findByIdAndSetId(replacementId, setId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Zamena libera nije pronađena u ovom setu."));
        if (!replacementId.equals(scores.get(matchId, setId).libero().undoableId()))
            throw conflict("Prvo poništite kasnije poene ili promene postave.");
        row.cancel(request.requestId(), request.version()); set.advancePlayVersion(); replacements.flush(); sets.flush();
        return scores.get(matchId, setId);
    }
    private MatchSet lock(UUID matchId, UUID setId) {
        matches.findByIdForUpdate(matchId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena."));
        return sets.findByIdAndMatchId(setId, matchId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Set nije pronađen u ovoj utakmici."));
    }
    private void requireLive(MatchSet set, int version) {
        if (set.getStatus() != MatchSetStatus.LIVE || set.getMatch().getStatus() != MatchStatus.LIVE)
            throw conflict("Zamene libera su dozvoljene samo tokom aktivnog seta i utakmice.");
        if (set.getScoreVersion() != version) throw conflict("Stanje seta je promenjeno. Osvežite ga pre zamene libera.");
    }
    private static ApiException conflict(String message) { return new ApiException(HttpStatus.CONFLICT, message); }
}
