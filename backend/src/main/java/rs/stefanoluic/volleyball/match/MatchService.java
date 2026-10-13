package rs.stefanoluic.volleyball.match;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.dto.*;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import rs.stefanoluic.volleyball.team.Team;
import rs.stefanoluic.volleyball.team.TeamRepository;

import java.util.UUID;

@Service
public class MatchService {
    private final MatchRepository matches;
    private final TeamRepository teams;
    private final MatchPlayerRepository matchPlayers;

    public MatchService(MatchRepository matches, TeamRepository teams, MatchPlayerRepository matchPlayers) {
        this.matches = matches;
        this.teams = teams;
        this.matchPlayers = matchPlayers;
    }

    @Transactional(readOnly = true)
    public MatchPageResponse list(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravna stranica ili veličina stranice.");
        }
        var pageable = PageRequest.of(page, size,
                Sort.by(Sort.Order.desc("scheduledAt"), Sort.Order.asc("id")));
        return MatchPageResponse.from(matches.findAll(pageable).map(MatchResponse::from));
    }

    @Transactional(readOnly = true)
    public MatchResponse get(UUID id) {
        return MatchResponse.from(matches.findById(id).orElseThrow(MatchService::notFound));
    }

    @Transactional
    public MatchResponse create(MatchRequest request) {
        var participants = participants(request);
        return MatchResponse.from(matches.saveAndFlush(
                new Match(participants.home(), participants.away(), request.scheduledAt())));
    }

    @Transactional
    public MatchResponse update(UUID id, MatchRequest request) {
        Match match = matches.findByIdForUpdate(id).orElseThrow(MatchService::notFound);
        requireScheduled(match);
        var participants = participants(request);
        if ((!match.getHomeTeam().getId().equals(request.homeTeamId())
                || !match.getAwayTeam().getId().equals(request.awayTeamId()))
                && matchPlayers.existsByMatchId(id)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Pre promene timova ispraznite i sačuvajte oba sastava utakmice.");
        }
        match.update(participants.home(), participants.away(), request.scheduledAt());
        matches.flush();
        return MatchResponse.from(match);
    }

    @Transactional
    public void delete(UUID id) {
        Match match = matches.findByIdForUpdate(id).orElseThrow(MatchService::notFound);
        requireScheduled(match);
        matches.delete(match);
        matches.flush();
    }

    private Participants participants(MatchRequest request) {
        if (request.homeTeamId().equals(request.awayTeamId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Domaćin i gost moraju biti različiti timovi.");
        }
        // The same order prevents deadlocks when concurrent matches reverse the two teams.
        UUID firstId = request.homeTeamId().compareTo(request.awayTeamId()) < 0
                ? request.homeTeamId() : request.awayTeamId();
        UUID secondId = firstId.equals(request.homeTeamId()) ? request.awayTeamId() : request.homeTeamId();
        Team first = lockTeam(firstId);
        Team second = lockTeam(secondId);
        return firstId.equals(request.homeTeamId())
                ? new Participants(first, second) : new Participants(second, first);
    }

    private Team lockTeam(UUID id) {
        return teams.findByIdForUpdate(id).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Jedan od izabranih timova više ne postoji. Osvežite listu timova."));
    }

    private static void requireScheduled(Match match) {
        if (match.getStatus() != MatchStatus.SCHEDULED) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Samo zakazana utakmica može da se izmeni ili obriše.");
        }
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena.");
    }

    private record Participants(Team home, Team away) {}
}
