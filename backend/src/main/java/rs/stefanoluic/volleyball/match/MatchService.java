package rs.stefanoluic.volleyball.match;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.dto.*;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import rs.stefanoluic.volleyball.team.Team;
import rs.stefanoluic.volleyball.team.TeamRepository;

import java.util.UUID;
import java.util.ArrayList;
import java.util.Locale;
import java.time.Instant;

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
    public MatchPageResponse list(int page, int size, String query, MatchStatus status, Instant from, Instant until) {
        if (page < 0 || size < 1 || size > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravna stranica ili veličina stranice.");
        }
        String text = Team.normalizeText(query == null ? "" : query);
        if (text.length() > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pretraga može imati najviše 100 znakova.");
        }
        if (from != null && until != null && !from.isBefore(until)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Početak perioda mora biti pre njegovog kraja.");
        }
        Specification<Match> filters = (root, criteriaQuery, builder) -> {
            var predicates = new ArrayList<Predicate>();
            if (!text.isEmpty()) {
                // LIKE metacharacters are literal user text, not additional wildcard operators.
                String escaped = text.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
                String pattern = "%" + escaped + "%";
                predicates.add(builder.or(builder.like(builder.lower(root.get("homeTeam").get("name")), pattern, '\\'),
                        builder.like(builder.lower(root.get("awayTeam").get("name")), pattern, '\\')));
            }
            if (status != null) predicates.add(builder.equal(root.get("status"), status));
            if (from != null) predicates.add(builder.greaterThanOrEqualTo(root.<Instant>get("scheduledAt"), from));
            if (until != null) predicates.add(builder.lessThan(root.<Instant>get("scheduledAt"), until));
            return builder.and(predicates.toArray(Predicate[]::new));
        };
        var pageable = PageRequest.of(page, size,
                Sort.by(Sort.Order.desc("scheduledAt"), Sort.Order.asc("id")));
        return MatchPageResponse.from(matches.findAll(filters, pageable).map(MatchResponse::from));
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
