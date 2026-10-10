package rs.stefanoluic.volleyball.player;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.player.dto.*;
import rs.stefanoluic.volleyball.team.Team;
import rs.stefanoluic.volleyball.team.TeamRepository;

import java.util.UUID;

@Service
public class PlayerService {
    private final PlayerRepository players;
    private final TeamRepository teams;

    public PlayerService(PlayerRepository players, TeamRepository teams) {
        this.players = players;
        this.teams = teams;
    }

    @Transactional(readOnly = true)
    public PlayerPageResponse list(UUID teamId, int page, int size) {
        if (!teams.existsById(teamId)) throw teamNotFound();
        if (page < 0 || size < 1 || size > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravna stranica ili veličina stranice.");
        }
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Order.asc("jerseyNumber"), Sort.Order.asc("id")));
        return PlayerPageResponse.from(players.findByTeamId(teamId, pageable).map(PlayerResponse::from));
    }

    @Transactional(readOnly = true)
    public PlayerResponse get(UUID teamId, UUID id) {
        if (!teams.existsById(teamId)) throw teamNotFound();
        return PlayerResponse.from(findPlayer(teamId, id));
    }

    @Transactional
    public PlayerResponse create(UUID teamId, PlayerRequest request) {
        Team team = lockTeam(teamId);
        if (players.existsByTeamIdAndJerseyNumber(teamId, request.jerseyNumber())) throw duplicate();
        return PlayerResponse.from(players.saveAndFlush(new Player(team, request.firstName(),
                request.lastName(), request.jerseyNumber(), request.position())));
    }

    @Transactional
    public PlayerResponse update(UUID teamId, UUID id, PlayerRequest request) {
        lockTeam(teamId);
        Player player = findPlayer(teamId, id);
        if (players.existsByTeamIdAndJerseyNumberAndIdNot(teamId, request.jerseyNumber(), id)) throw duplicate();
        player.update(request.firstName(), request.lastName(), request.jerseyNumber(), request.position());
        players.flush();
        return PlayerResponse.from(player);
    }

    @Transactional
    public void delete(UUID teamId, UUID id) {
        lockTeam(teamId);
        players.delete(findPlayer(teamId, id));
        players.flush();
    }

    // Player mutations and team deletion take the same parent-row lock.
    // This serializes roster changes and prevents a team from disappearing during a write.
    private Team lockTeam(UUID teamId) {
        return teams.findByIdForUpdate(teamId).orElseThrow(PlayerService::teamNotFound);
    }

    private Player findPlayer(UUID teamId, UUID id) {
        return players.findByIdAndTeamId(id, teamId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Igrač nije pronađen u ovom timu."));
    }

    private static ApiException teamNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "Tim nije pronađen.");
    }

    private static ApiException duplicate() {
        return new ApiException(HttpStatus.CONFLICT, "Igrač sa ovim brojem dresa već postoji u timu.");
    }
}
