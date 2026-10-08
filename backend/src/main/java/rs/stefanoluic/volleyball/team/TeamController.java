package rs.stefanoluic.volleyball.team;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import rs.stefanoluic.volleyball.team.dto.TeamPageResponse;
import rs.stefanoluic.volleyball.team.dto.TeamRequest;
import rs.stefanoluic.volleyball.team.dto.TeamResponse;

import java.util.UUID;

@RestController
@RequestMapping("/api/teams")
public class TeamController {
    private final TeamService teams;

    public TeamController(TeamService teams) {
        this.teams = teams;
    }

    @GetMapping
    public TeamPageResponse list(@RequestParam(defaultValue = "0") int page,
                                 @RequestParam(defaultValue = "20") int size) {
        return teams.list(page, size);
    }

    @GetMapping("/{id}")
    public TeamResponse get(@PathVariable UUID id) {
        return teams.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TeamResponse create(@Valid @RequestBody TeamRequest request) {
        return teams.create(request);
    }

    @PutMapping("/{id}")
    public TeamResponse update(@PathVariable UUID id, @Valid @RequestBody TeamRequest request) {
        return teams.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        teams.delete(id);
    }
}
