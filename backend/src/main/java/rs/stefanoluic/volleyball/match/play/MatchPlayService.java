package rs.stefanoluic.volleyball.match.play;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.Match;
import rs.stefanoluic.volleyball.match.MatchRepository;
import rs.stefanoluic.volleyball.match.MatchStatus;
import rs.stefanoluic.volleyball.match.play.dto.*;
import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import rs.stefanoluic.volleyball.match.roster.MatchRosterService;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class MatchPlayService {
    private final MatchRepository matches;
    private final MatchPlayerRepository participants;
    private final MatchRosterService rosters;
    private final MatchSetRepository sets;
    private final SetLineupRepository lineups;
    public MatchPlayService(MatchRepository matches, MatchPlayerRepository participants, MatchRosterService rosters,
                            MatchSetRepository sets, SetLineupRepository lineups) {
        this.matches = matches;
        this.participants = participants;
        this.rosters = rosters;
        this.sets = sets;
        this.lineups = lineups;
    }

    @Transactional(readOnly = true)
    public MatchPreparationResponse get(UUID matchId) {
        return response(matches.findById(matchId).orElseThrow(MatchPlayService::notFound));
    }

    @Transactional
    public MatchPreparationResponse start(UUID matchId, StartMatchRequest request) {
        // Roster saves and match mutations use this same lock, including concurrent starts.
        Match match = matches.findByIdForUpdate(matchId).orElseThrow(MatchPlayService::notFound);
        if (match.getStatus() != MatchStatus.SCHEDULED || sets.existsByMatchId(matchId)) {
            throw conflict("Utakmica je već pokrenuta ili nije zakazana. Učitajte trenutno stanje.");
        }
        if (request.rosterVersion() != match.getRosterVersion()) {
            throw conflict("Sastav je u međuvremenu promenjen. Učitajte podatke i ponovo izaberite postave.");
        }
        UUID serving = request.firstServingTeamId();
        if (!match.getHomeTeam().getId().equals(serving) && !match.getAwayTeam().getId().equals(serving)) {
            throw badRequest("Prvi servis mora pripadati jednom od timova ove utakmice.");
        }
        Map<UUID, MatchPlayer> saved = participants.findByMatchIdOrderByJerseyNumberAscIdAsc(matchId)
                .stream().collect(Collectors.toMap(MatchPlayer::getId, Function.identity()));
        List<MatchPlayer> home = validate(request.homeLineup(), match.getHomeTeam().getId(), saved);
        List<MatchPlayer> away = validate(request.awayLineup(), match.getAwayTeam().getId(), saved);

        MatchSet set = sets.saveAndFlush(new MatchSet(match, 1,
                serving.equals(match.getHomeTeam().getId()) ? match.getHomeTeam() : match.getAwayTeam()));
        List<SetLineup> rows = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            rows.add(new SetLineup(set, match, home.get(index), index + 1));
            rows.add(new SetLineup(set, match, away.get(index), index + 1));
        }
        lineups.saveAllAndFlush(rows);
        match.start();
        matches.flush();
        return response(match);
    }

    private List<MatchPlayer> validate(List<UUID> ids, UUID teamId, Map<UUID, MatchPlayer> saved) {
        if (ids.size() != 6 || new HashSet<>(ids).size() != 6) {
            throw badRequest("Početna postava mora imati šest različitih igrača.");
        }
        List<MatchPlayer> result = new ArrayList<>();
        for (UUID id : ids) {
            MatchPlayer player = saved.get(id);
            if (player == null || !player.getTeam().getId().equals(teamId)) {
                throw badRequest("Igrač mora biti u sačuvanom sastavu odgovarajućeg tima za ovu utakmicu.");
            }
            if (player.isLibero()) throw badRequest("Prijavljeni libero ne može biti u početnoj šestorki.");
            result.add(player);
        }
        return result;
    }

    private MatchPreparationResponse response(Match match) {
        MatchSetResponse firstSet = sets.findByMatchIdAndNumber(match.getId(), 1).map(set -> {
            var rows = lineups.findBySetIdOrderByRotationPositionAsc(set.getId());
            return new MatchSetResponse(set.getId(), set.getNumber(), set.getStatus(), set.getHomeScore(), set.getAwayScore(),
                    set.getFirstServingTeam().getId(), set.getStartedAt(),
                    rows.stream().filter(row -> row.getParticipant().getTeam().getId().equals(match.getHomeTeam().getId()))
                            .map(LineupPlayerResponse::from).toList(),
                    rows.stream().filter(row -> row.getParticipant().getTeam().getId().equals(match.getAwayTeam().getId()))
                            .map(LineupPlayerResponse::from).toList());
        }).orElse(null);
        return new MatchPreparationResponse(rosters.get(match.getId()), firstSet);
    }
    private static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena."); }
    private static ApiException badRequest(String message) { return new ApiException(HttpStatus.BAD_REQUEST, message); }
    private static ApiException conflict(String message) { return new ApiException(HttpStatus.CONFLICT, message); }
}
