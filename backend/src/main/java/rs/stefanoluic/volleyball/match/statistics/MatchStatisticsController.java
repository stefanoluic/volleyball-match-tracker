package rs.stefanoluic.volleyball.match.statistics;

import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.match.statistics.dto.MatchStatisticsResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/matches/{matchId}/statistics")
public class MatchStatisticsController {
    private final MatchStatisticsService service;
    public MatchStatisticsController(MatchStatisticsService service) { this.service = service; }

    @GetMapping
    public MatchStatisticsResponse get(@PathVariable UUID matchId, @RequestParam(required = false) UUID setId) {
        return service.get(matchId, setId);
    }
}
