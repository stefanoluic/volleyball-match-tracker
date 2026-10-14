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
}
