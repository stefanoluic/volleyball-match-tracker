package rs.stefanoluic.volleyball.team;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.player.PlayerRepository;
import rs.stefanoluic.volleyball.match.MatchRepository;
import rs.stefanoluic.volleyball.team.dto.TeamPageResponse;
import rs.stefanoluic.volleyball.team.dto.TeamRequest;
import rs.stefanoluic.volleyball.team.dto.TeamResponse;

import java.util.UUID;

@Service
public class TeamService {
    private final TeamRepository teams;
    private final PlayerRepository players;
    private final MatchRepository matches;

    public TeamService(TeamRepository teams, PlayerRepository players, MatchRepository matches) {
        this.teams = teams;
        this.players = players;
        this.matches = matches;
    }

    @Transactional(readOnly = true)
    public TeamPageResponse list(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravna stranica ili veličina stranice.");
        }
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Order.asc("name"), Sort.Order.asc("id")));
        return TeamPageResponse.from(teams.findAll(pageable).map(TeamResponse::from));
    }

    @Transactional(readOnly = true)
    public TeamResponse get(UUID id) {
        return TeamResponse.from(teams.findById(id).orElseThrow(TeamService::notFound));
    }

    @Transactional
    public TeamResponse create(TeamRequest request) {
        if (teams.existsByNameIgnoreCaseAndCityIgnoreCase(request.name(), request.city())) {
            throw duplicate();
        }
        return TeamResponse.from(teams.saveAndFlush(new Team(request.name(), request.city())));
    }

    @Transactional
    public TeamResponse update(UUID id, TeamRequest request) {
        Team team = teams.findByIdForUpdate(id).orElseThrow(TeamService::notFound);
        if (teams.existsByNameIgnoreCaseAndCityIgnoreCaseAndIdNot(request.name(), request.city(), id)) {
            throw duplicate();
        }
        team.update(request.name(), request.city());
        teams.flush();
        return TeamResponse.from(team);
    }

    @Transactional
    public void delete(UUID id) {
        Team team = teams.findByIdForUpdate(id).orElseThrow(TeamService::notFound);
        if (players.existsByTeamId(id)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Tim nije moguće obrisati dok ima igrače. Najpre obrišite njegove igrače.");
        }
        if (matches.existsByHomeTeamIdOrAwayTeamId(id, id)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Tim nije moguće obrisati dok je povezan sa utakmicom.");
        }
        teams.delete(team);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "Tim nije pronađen.");
    }

    private static ApiException duplicate() {
        return new ApiException(HttpStatus.CONFLICT, "Tim sa ovim nazivom i gradom već postoji.");
    }
}
