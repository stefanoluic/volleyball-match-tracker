package rs.stefanoluic.volleyball.player;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.player.dto.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/teams/{teamId}/players")
public class PlayerController {
    private final PlayerService service;

    public PlayerController(PlayerService service) {
        this.service = service;
    }

    @GetMapping
    public PlayerPageResponse list(@PathVariable UUID teamId, @RequestParam(defaultValue = "0") int page,
                                   @RequestParam(defaultValue = "20") int size) {
        return service.list(teamId, page, size);
    }

    @GetMapping("/{id}")
    public PlayerResponse get(@PathVariable UUID teamId, @PathVariable UUID id) {
        return service.get(teamId, id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PlayerResponse create(@PathVariable UUID teamId, @Valid @RequestBody PlayerRequest request) {
        return service.create(teamId, request);
    }

    @PutMapping("/{id}")
    public PlayerResponse update(@PathVariable UUID teamId, @PathVariable UUID id,
                                 @Valid @RequestBody PlayerRequest request) {
        return service.update(teamId, id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID teamId, @PathVariable UUID id) {
        service.delete(teamId, id);
    }
}
