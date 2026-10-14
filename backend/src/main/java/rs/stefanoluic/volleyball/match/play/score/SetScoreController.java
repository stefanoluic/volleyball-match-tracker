package rs.stefanoluic.volleyball.match.play.score;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.match.play.score.dto.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/matches/{matchId}/sets/{setId}")
public class SetScoreController {
    private final SetScoreService service;
    public SetScoreController(SetScoreService service) { this.service = service; }
    @GetMapping("/score")
    public SetScoreResponse get(@PathVariable UUID matchId, @PathVariable UUID setId) {
        return service.get(matchId, setId);
    }
    @PostMapping("/points")
    public SetScoreResponse add(@PathVariable UUID matchId, @PathVariable UUID setId,
                               @Valid @RequestBody AddPointRequest request) {
        return service.add(matchId, setId, request);
    }
    @PostMapping("/points/{pointId}/undo")
    public SetScoreResponse undo(@PathVariable UUID matchId, @PathVariable UUID setId,
                                @PathVariable UUID pointId, @Valid @RequestBody UndoPointRequest request) {
        return service.undo(matchId, setId, pointId, request);
    }
}
