package rs.stefanoluic.volleyball.match.play.substitution;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.match.play.score.dto.SetScoreResponse;
import rs.stefanoluic.volleyball.match.play.score.dto.UndoPointRequest;
import rs.stefanoluic.volleyball.match.play.substitution.dto.SubstituteRequest;
import java.util.UUID;

@RestController
@RequestMapping("/api/matches/{matchId}/sets/{setId}/substitutions")
public class SetSubstitutionController {
    private final SetSubstitutionService service;
    public SetSubstitutionController(SetSubstitutionService service) { this.service = service; }
    @PostMapping
    public SetScoreResponse add(@PathVariable UUID matchId, @PathVariable UUID setId, @Valid @RequestBody SubstituteRequest request) {
        return service.add(matchId, setId, request);
    }
    @PostMapping("/{substitutionId}/undo")
    public SetScoreResponse undo(@PathVariable UUID matchId, @PathVariable UUID setId,
                                 @PathVariable UUID substitutionId, @Valid @RequestBody UndoPointRequest request) {
        return service.undo(matchId, setId, substitutionId, request);
    }
}
