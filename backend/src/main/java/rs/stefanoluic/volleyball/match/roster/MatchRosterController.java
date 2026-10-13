package rs.stefanoluic.volleyball.match.roster;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.match.roster.dto.MatchRosterRequest;
import rs.stefanoluic.volleyball.match.roster.dto.MatchRosterResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/matches/{matchId}/roster")
public class MatchRosterController {
    private final MatchRosterService rosters;

    public MatchRosterController(MatchRosterService rosters) { this.rosters = rosters; }

    @GetMapping
    public MatchRosterResponse get(@PathVariable UUID matchId) { return rosters.get(matchId); }

    @PutMapping
    public MatchRosterResponse save(@PathVariable UUID matchId, @Valid @RequestBody MatchRosterRequest request) {
        return rosters.save(matchId, request);
    }
}
