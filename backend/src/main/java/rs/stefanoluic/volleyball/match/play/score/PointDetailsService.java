package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.Match;
import rs.stefanoluic.volleyball.match.play.score.dto.AddPointRequest;
import rs.stefanoluic.volleyball.match.play.score.dto.SetCourtResponse;
import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;

@Service
public class PointDetailsService {
    private final MatchPlayerRepository participants;

    public PointDetailsService(MatchPlayerRepository participants) { this.participants = participants; }

    // Validate against the court BEFORE the rally, never the rotation caused by its result.
    public MatchPlayer validate(Match match, AddPointRequest request, SetCourtResponse court) {
        var type = request.actionType();
        var id = request.participantId();
        if (type == PointActionType.UNSPECIFIED) {
            if (id != null) throw invalid("Za poen bez detalja ne birate igrača.");
            return null;
        }
        if (court == null) throw new ApiException(HttpStatus.CONFLICT,
                "Raspored nije dostupan. Poen možete uneti bez detalja.");
        boolean homeScored = match.getHomeTeam().getId().equals(request.scoringTeamId());
        boolean error = type == PointActionType.OPPONENT_ERROR;
        var rows = homeScored != error ? court.homeLineup() : court.awayLineup();
        if (id == null) {
            if (error) return null; // A team fault need not be attributed to one individual.
            throw invalid("Izaberite igrača kome pripada ova akcija.");
        }
        var row = rows.stream().filter(entry -> entry.participant().id().equals(id)).findFirst()
                .orElseThrow(() -> invalid(error
                        ? "Izaberite igrača protivničkog tima koji je trenutno na terenu."
                        : "Izaberite igrača tima koji osvaja poen i koji je trenutno na terenu."));
        if (type == PointActionType.SERVICE_ACE && (court.server() == null
                || !court.server().id().equals(id) || !request.scoringTeamId().equals(court.servingTeamId()))) {
            throw invalid("Servis-as može se pripisati samo igraču koji trenutno servira.");
        }
        if (type == PointActionType.BLOCK && (row.participant().isLibero()
                || row.rotationPosition() < 2 || row.rotationPosition() > 4)) {
            throw invalid("Poen blokom može se pripisati samo igraču prednje linije koji nije libero.");
        }
        return participants.findById(id).orElseThrow(() -> invalid("Igrač nije pronađen u sastavu utakmice."));
    }

    private static ApiException invalid(String message) { return new ApiException(HttpStatus.BAD_REQUEST, message); }
}
