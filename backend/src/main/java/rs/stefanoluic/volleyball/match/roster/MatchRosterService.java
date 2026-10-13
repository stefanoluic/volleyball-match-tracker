package rs.stefanoluic.volleyball.match.roster;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.*;
import rs.stefanoluic.volleyball.match.dto.MatchResponse;
import rs.stefanoluic.volleyball.match.roster.dto.*;
import rs.stefanoluic.volleyball.player.Player;
import rs.stefanoluic.volleyball.player.PlayerRepository;
import rs.stefanoluic.volleyball.player.dto.PlayerResponse;
import rs.stefanoluic.volleyball.team.Team;
import rs.stefanoluic.volleyball.team.TeamRepository;
import rs.stefanoluic.volleyball.team.dto.TeamResponse;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class MatchRosterService {
    private final MatchRepository matches;
    private final MatchPlayerRepository entries;
    private final PlayerRepository players;
    private final TeamRepository teams;

    public MatchRosterService(MatchRepository matches, MatchPlayerRepository entries,
                              PlayerRepository players, TeamRepository teams) {
        this.matches = matches;
        this.entries = entries;
        this.players = players;
        this.teams = teams;
    }

    @Transactional(readOnly = true)
    public MatchRosterResponse get(UUID matchId) {
        return response(matches.findById(matchId).orElseThrow(MatchRosterService::notFound));
    }

    @Transactional
    public MatchRosterResponse save(UUID matchId, MatchRosterRequest request) {
        Match match = matches.findByIdForUpdate(matchId).orElseThrow(MatchRosterService::notFound);
        if (match.getStatus() != MatchStatus.SCHEDULED) {
            throw conflict("Sastav može da se menja samo dok je utakmica zakazana.");
        }
        if (request.version() != match.getRosterVersion()) {
            throw conflict("Sastav je u međuvremenu promenjen. Učitajte sačuvani sastav pre ponovnog čuvanja.");
        }
        // Match writes lock the match first, then both teams in a stable order.
        // Player writes lock their team, so selected player data cannot change during this save.
        List<UUID> teamIds = new ArrayList<>(List.of(match.getHomeTeam().getId(), match.getAwayTeam().getId()));
        teamIds.sort(UUID::compareTo);
        for (UUID id : teamIds) teams.findByIdForUpdate(id).orElseThrow(MatchRosterService::notFound);

        List<MatchPlayer> existing = entries.findByMatchIdOrderByJerseyNumberAscIdAsc(matchId);
        Map<UUID, MatchPlayer> byPlayer = existing.stream().collect(
                Collectors.toMap(entry -> entry.getPlayer().getId(), Function.identity()));
        Set<UUID> selectedIds = new HashSet<>();
        List<Selection> selected = new ArrayList<>();
        selected.addAll(select(match, match.getHomeTeam(), request.homePlayers(), byPlayer, selectedIds));
        selected.addAll(select(match, match.getAwayTeam(), request.awayPlayers(), byPlayer, selectedIds));

        // Validate both teams before changing anything; remove old rows before jersey reuse.
        entries.deleteAll(existing.stream().filter(entry -> !selectedIds.contains(entry.getPlayer().getId())).toList());
        entries.flush();
        for (Selection selection : selected) selection.entry().designateLibero(selection.libero());
        entries.saveAllAndFlush(selected.stream().map(Selection::entry).toList());
        match.advanceRosterVersion();
        matches.flush();
        return response(match);
    }

    private List<Selection> select(Match match, Team team, List<RosterPlayerRequest> input,
                                   Map<UUID, MatchPlayer> existing, Set<UUID> selectedIds) {
        if (input.stream().filter(RosterPlayerRequest::isLibero).count() > 2) {
            throw badRequest("U jednom timu možete označiti najviše dva libera.");
        }
        Map<UUID, Player> currentPlayers = players.findByTeamIdOrderByJerseyNumberAscIdAsc(team.getId()).stream()
                .collect(Collectors.toMap(Player::getId, Function.identity()));
        Set<Integer> jerseys = new HashSet<>();
        List<Selection> result = new ArrayList<>();
        for (RosterPlayerRequest requested : input) {
            if (!selectedIds.add(requested.playerId())) throw badRequest("Isti igrač ne može biti dodat dva puta.");
            MatchPlayer entry = existing.get(requested.playerId());
            if (entry != null) {
                if (!entry.getTeam().getId().equals(team.getId())) {
                    throw badRequest("Igrač je već u sastavu drugog tima za ovu utakmicu.");
                }
            } else {
                Player player = currentPlayers.get(requested.playerId());
                if (player == null) throw badRequest("Izabrani igrač ne pripada ovom timu ili više ne postoji.");
                entry = new MatchPlayer(match, team, player, requested.isLibero());
            }
            if (!jerseys.add(entry.getJerseyNumber())) {
                throw conflict("Izabrani igrači imaju isti broj dresa u sačuvanim podacima ovog sastava.");
            }
            result.add(new Selection(entry, requested.isLibero()));
        }
        return result;
    }

    private MatchRosterResponse response(Match match) {
        List<MatchPlayer> selected = entries.findByMatchIdOrderByJerseyNumberAscIdAsc(match.getId());
        return new MatchRosterResponse(MatchResponse.from(match), match.getRosterVersion(),
                teamRoster(match.getHomeTeam(), selected), teamRoster(match.getAwayTeam(), selected));
    }

    private TeamRosterResponse teamRoster(Team team, List<MatchPlayer> selected) {
        return new TeamRosterResponse(TeamResponse.from(team),
                selected.stream().filter(entry -> entry.getTeam().getId().equals(team.getId()))
                        .map(MatchPlayerResponse::from).toList(),
                players.findByTeamIdOrderByJerseyNumberAscIdAsc(team.getId()).stream().map(PlayerResponse::from).toList());
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena.");
    }
    private static ApiException badRequest(String message) { return new ApiException(HttpStatus.BAD_REQUEST, message); }
    private static ApiException conflict(String message) { return new ApiException(HttpStatus.CONFLICT, message); }
    private record Selection(MatchPlayer entry, boolean libero) {}
}
