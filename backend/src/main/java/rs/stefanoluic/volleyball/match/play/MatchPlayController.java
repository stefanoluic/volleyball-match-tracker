package rs.stefanoluic.volleyball.match.play;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.match.play.dto.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/matches/{matchId}")
public class MatchPlayController {
    private final MatchPlayService service;
    public MatchPlayController(MatchPlayService service) { this.service = service; }
    @GetMapping("/preparation")
    public MatchPreparationResponse get(@PathVariable UUID matchId) { return service.get(matchId); }
    @PostMapping("/start")
    public MatchPreparationResponse start(@PathVariable UUID matchId, @Valid @RequestBody StartMatchRequest request) {
        return service.start(matchId, request);
    }
    @PostMapping("/sets")
    public MatchPreparationResponse startNext(@PathVariable UUID matchId, @Valid @RequestBody StartNextSetRequest request) {
        return service.startNext(matchId, request);
    }
    @PostMapping("/sets/{setId}/finish")
    public MatchPreparationResponse finish(@PathVariable UUID matchId, @PathVariable UUID setId,
                                          @Valid @RequestBody FinishSetRequest request) {
        return service.finish(matchId, setId, request);
    }
}
