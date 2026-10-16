package rs.stefanoluic.volleyball.match.play.libero;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.match.play.score.dto.SetScoreResponse;
import rs.stefanoluic.volleyball.match.play.score.dto.UndoPointRequest;
import rs.stefanoluic.volleyball.match.play.substitution.dto.SubstituteRequest;
import java.util.UUID;

@RestController
@RequestMapping("/api/matches/{matchId}/sets/{setId}/libero-replacements")
public class LiberoReplacementController {
    private final LiberoReplacementService service;
    public LiberoReplacementController(LiberoReplacementService service) { this.service = service; }
    @PostMapping
    public SetScoreResponse add(@PathVariable UUID matchId, @PathVariable UUID setId, @Valid @RequestBody SubstituteRequest request) {
        return service.add(matchId, setId, request);
    }
    @PostMapping("/{replacementId}/undo")
    public SetScoreResponse undo(@PathVariable UUID matchId, @PathVariable UUID setId, @PathVariable UUID replacementId,
                                 @Valid @RequestBody UndoPointRequest request) {
        return service.undo(matchId, setId, replacementId, request);
    }
}
