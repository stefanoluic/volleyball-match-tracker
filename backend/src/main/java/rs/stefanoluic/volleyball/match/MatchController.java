package rs.stefanoluic.volleyball.match;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.match.dto.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/matches")
public class MatchController {
    private final MatchService matches;

    public MatchController(MatchService matches) { this.matches = matches; }

    @GetMapping
    public MatchPageResponse list(@RequestParam(defaultValue = "0") int page,
                                 @RequestParam(defaultValue = "20") int size) {
        return matches.list(page, size);
    }

    @GetMapping("/{id}")
    public MatchResponse get(@PathVariable UUID id) { return matches.get(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MatchResponse create(@Valid @RequestBody MatchRequest request) { return matches.create(request); }

    @PutMapping("/{id}")
    public MatchResponse update(@PathVariable UUID id, @Valid @RequestBody MatchRequest request) {
        return matches.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) { matches.delete(id); }
}
