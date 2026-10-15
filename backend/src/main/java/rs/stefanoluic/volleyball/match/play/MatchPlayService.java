package rs.stefanoluic.volleyball.match.play;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.*;
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
        this.matches = matches; this.participants = participants; this.rosters = rosters;
        this.sets = sets; this.lineups = lineups;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public MatchPreparationResponse get(UUID matchId) {
        return response(matches.findById(matchId).orElseThrow(MatchPlayService::notFound));
    }
    @Transactional
    public MatchPreparationResponse start(UUID matchId, StartMatchRequest request) {
        Match match = lock(matchId);
        if (match.getStatus() != MatchStatus.SCHEDULED || sets.existsByMatchId(matchId)) {
            throw conflict("Utakmica je već pokrenuta ili nije zakazana. Učitajte trenutno stanje.");
        }
        createSet(match, 1, request);
        match.start(); matches.flush();
        return response(match);
    }
    @Transactional
    public MatchPreparationResponse startNext(UUID matchId, StartNextSetRequest request) {
        Match match = lock(matchId);
        List<MatchSet> existing = sets.findByMatchIdOrderByNumberAsc(matchId);
        if (match.getStatus() != MatchStatus.LIVE || existing.isEmpty()) throw conflict("Naredni set nije dostupan.");
        MatchSet previous = existing.getLast();
        if (previous.getStatus() != MatchSetStatus.FINISHED || previous.getWinningTeamId() == null
                || !previous.getId().equals(request.previousSetId()) || previous.getScoreVersion() != request.previousSetVersion()
                || request.number() != previous.getNumber() + 1 || request.number() > 5
                || existing.stream().anyMatch(set -> set.getStatus() == MatchSetStatus.LIVE)
                || wins(existing, match.getHomeTeam().getId()) >= 3 || wins(existing, match.getAwayTeam().getId()) >= 3) {
            throw conflict("Stanje setova je promenjeno ili prethodni set nije završen. Učitajte trenutno stanje.");
        }
        if (request.number() == 5) {
            if (wins(existing, match.getHomeTeam().getId()) != 2 || wins(existing, match.getAwayTeam().getId()) != 2) {
                throw conflict("Peti set je moguć samo pri rezultatu 2:2 u setovima.");
            }
        } else {
            UUID expected = previous.getFirstServingTeam().getId().equals(match.getHomeTeam().getId())
                    ? match.getAwayTeam().getId() : match.getHomeTeam().getId();
            if (!expected.equals(request.firstServingTeamId())) throw badRequest("Prvi servis mora pripadati timu koji nije prvi servirao u prethodnom setu.");
        }
        createSet(match, request.number(), request.lineup());
        return response(match);
    }
    @Transactional
    public MatchPreparationResponse finish(UUID matchId, UUID setId, FinishSetRequest request) {
        Match match = lock(matchId);
        MatchSet set = sets.findByIdAndMatchId(setId, matchId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Set nije pronađen u ovoj utakmici."));
        if (set.getStatus() == MatchSetStatus.FINISHED) {
            if (request.requestId().equals(set.getFinishRequestId()) && request.version().equals(set.getFinishExpectedVersion())) {
                return response(match);
            }
            throw conflict("Kraj ovog seta je već potvrđen. Učitajte trenutno stanje.");
        }
        List<MatchSet> all = sets.findByMatchIdOrderByNumberAsc(matchId);
        if (match.getStatus() != MatchStatus.LIVE || all.isEmpty() || !all.getLast().getId().equals(setId)) {
            throw conflict("Možete završiti samo aktuelni set utakmice koja je u toku.");
        }
        if (set.getScoreVersion() != request.version()) throw conflict("Rezultat je promenjen. Osvežite ga pre potvrde kraja seta.");
        if (!set.hasWinningScore()) throw conflict("Rezultat još ne ispunjava uslov za kraj seta.");
        set.finish(request.requestId(), request.version());
        sets.flush();
        if (wins(all, match.getHomeTeam().getId()) >= 3 || wins(all, match.getAwayTeam().getId()) >= 3) {
            match.finish(); matches.flush();
        }
        return response(match);
    }
    private void createSet(Match match, int number, StartMatchRequest request) {
        if (request.rosterVersion() != match.getRosterVersion()) throw conflict("Sastav je promenjen. Učitajte podatke i ponovo izaberite postave.");
        UUID serving = request.firstServingTeamId();
        if (!match.getHomeTeam().getId().equals(serving) && !match.getAwayTeam().getId().equals(serving)) {
            throw badRequest("Prvi servis mora pripadati jednom od timova ove utakmice.");
        }
        Map<UUID, MatchPlayer> saved = participants.findByMatchIdOrderByJerseyNumberAscIdAsc(match.getId())
                .stream().collect(Collectors.toMap(MatchPlayer::getId, Function.identity()));
        List<MatchPlayer> home = validate(request.homeLineup(), match.getHomeTeam().getId(), saved);
        List<MatchPlayer> away = validate(request.awayLineup(), match.getAwayTeam().getId(), saved);
        MatchSet set = sets.saveAndFlush(new MatchSet(match, number,
                serving.equals(match.getHomeTeam().getId()) ? match.getHomeTeam() : match.getAwayTeam()));
        List<SetLineup> rows = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            rows.add(new SetLineup(set, match, home.get(index), index + 1));
            rows.add(new SetLineup(set, match, away.get(index), index + 1));
        }
        lineups.saveAllAndFlush(rows);
    }
    private List<MatchPlayer> validate(List<UUID> ids, UUID teamId, Map<UUID, MatchPlayer> saved) {
        if (ids.size() != 6 || new HashSet<>(ids).size() != 6) throw badRequest("Početna postava mora imati šest različitih igrača.");
        List<MatchPlayer> result = new ArrayList<>();
        for (UUID id : ids) {
            MatchPlayer player = saved.get(id);
            if (player == null || !player.getTeam().getId().equals(teamId)) throw badRequest("Igrač mora biti u sačuvanom sastavu odgovarajućeg tima za ovu utakmicu.");
            if (player.isLibero()) throw badRequest("Prijavljeni libero ne može biti u početnoj šestorki.");
            result.add(player);
        }
        return result;
    }
    private MatchPreparationResponse response(Match match) {
        List<MatchSetResponse> all = sets.findByMatchIdOrderByNumberAsc(match.getId()).stream().map(set -> {
            var rows = lineups.findBySetIdOrderByRotationPositionAsc(set.getId());
            return new MatchSetResponse(set.getId(), set.getNumber(), set.getStatus(), set.getHomeScore(), set.getAwayScore(),
                    set.getFirstServingTeam().getId(), set.getStartedAt(),
                    rows.stream().filter(row -> row.getParticipant().getTeam().getId().equals(match.getHomeTeam().getId())).map(LineupPlayerResponse::from).toList(),
                    rows.stream().filter(row -> row.getParticipant().getTeam().getId().equals(match.getAwayTeam().getId())).map(LineupPlayerResponse::from).toList(),
                    set.getScoreVersion(), set.getFinishedAt(), set.getStatus() == MatchSetStatus.FINISHED ? set.getWinningTeamId() : null);
        }).toList();
        MatchSetResponse current = all.stream().filter(set -> set.status() == MatchSetStatus.LIVE).findFirst().orElse(null);
        int homeWins = (int) all.stream().filter(set -> match.getHomeTeam().getId().equals(set.winnerTeamId())).count();
        int awayWins = (int) all.stream().filter(set -> match.getAwayTeam().getId().equals(set.winnerTeamId())).count();
        Integer next = match.getStatus() == MatchStatus.LIVE && current == null && !all.isEmpty()
                && all.getLast().status() == MatchSetStatus.FINISHED && all.getLast().number() < 5
                && homeWins < 3 && awayWins < 3 ? all.getLast().number() + 1 : null;
        return new MatchPreparationResponse(rosters.get(match.getId()), all.isEmpty() ? null : all.getFirst(), all, current, next, homeWins, awayWins);
    }
    private long wins(List<MatchSet> all, UUID teamId) {
        return all.stream().filter(set -> set.getStatus() == MatchSetStatus.FINISHED && teamId.equals(set.getWinningTeamId())).count();
    }
    private Match lock(UUID id) { return matches.findByIdForUpdate(id).orElseThrow(MatchPlayService::notFound); }
    private static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena."); }
    private static ApiException badRequest(String message) { return new ApiException(HttpStatus.BAD_REQUEST, message); }
    private static ApiException conflict(String message) { return new ApiException(HttpStatus.CONFLICT, message); }
}
