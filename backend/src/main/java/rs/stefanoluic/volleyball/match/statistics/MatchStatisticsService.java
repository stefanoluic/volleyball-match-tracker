package rs.stefanoluic.volleyball.match.statistics;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.match.MatchRepository;
import rs.stefanoluic.volleyball.match.play.MatchSetRepository;
import rs.stefanoluic.volleyball.match.play.score.SetPointRepository;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import rs.stefanoluic.volleyball.match.statistics.dto.*;
import rs.stefanoluic.volleyball.team.Team;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class MatchStatisticsService {
    private final MatchRepository matches;
    private final MatchSetRepository sets;
    private final MatchPlayerRepository participants;
    private final SetPointRepository points;

    public MatchStatisticsService(MatchRepository matches, MatchSetRepository sets,
                                  MatchPlayerRepository participants, SetPointRepository points) {
        this.matches = matches; this.sets = sets; this.participants = participants; this.points = points;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public MatchStatisticsResponse get(UUID matchId, UUID setId) {
        var match = matches.findById(matchId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Utakmica nije pronađena."));
        var matchSets = sets.findByMatchIdOrderByNumberAsc(matchId);
        if (setId != null && matchSets.stream().noneMatch(set -> set.getId().equals(setId)))
            throw new ApiException(HttpStatus.NOT_FOUND, "Set nije pronađen u ovoj utakmici.");
        var home = new TeamTotals(match.getHomeTeam());
        var away = new TeamTotals(match.getAwayTeam());
        for (var participant : participants.findByMatchIdOrderByJerseyNumberAscIdAsc(matchId)) {
            var team = participant.getTeam().getId().equals(home.team.getId()) ? home : away;
            team.players.put(participant.getId(), new PlayerTotals(MatchPlayerResponse.from(participant)));
        }
        // The database groups ALL active points, not the bounded recent-history response.
        for (var row : points.summarize(matchId, setId)) {
            var winner = row.scoringTeamId().equals(home.team.getId()) ? home : away;
            var opponent = winner == home ? away : home;
            long count = row.total();
            winner.totalPoints += count;
            switch (row.actionType()) {
                case ATTACK -> { winner.attackPoints += count; winner.player(row.participantId()).attackPoints += count; }
                case BLOCK -> { winner.blockPoints += count; winner.player(row.participantId()).blockPoints += count; }
                case SERVICE_ACE -> { winner.serviceAces += count; winner.player(row.participantId()).serviceAces += count; }
                case UNSPECIFIED -> winner.unspecifiedPoints += count;
                case OPPONENT_ERROR -> {
                    winner.opponentErrors += count;
                    opponent.errors += count;
                    if (row.participantId() == null) opponent.unattributedErrors += count;
                    else opponent.player(row.participantId()).errors += count;
                }
            }
        }
        return new MatchStatisticsResponse(matchId, setId, match.getStatus(),
                matchSets.stream().map(StatisticsSet::from).toList(), home.response(), away.response());
    }

    private static class PlayerTotals {
        final MatchPlayerResponse participant;
        long attackPoints, blockPoints, serviceAces, errors;
        PlayerTotals(MatchPlayerResponse participant) { this.participant = participant; }
        PlayerStatistics response() {
            return new PlayerStatistics(participant, attackPoints, blockPoints, serviceAces,
                    attackPoints + blockPoints + serviceAces, errors);
        }
    }

    private static class TeamTotals {
        final Team team;
        final Map<UUID, PlayerTotals> players = new LinkedHashMap<>();
        long totalPoints, attackPoints, blockPoints, serviceAces, opponentErrors, unspecifiedPoints, errors, unattributedErrors;
        TeamTotals(Team team) { this.team = team; }
        PlayerTotals player(UUID id) {
            var player = players.get(id);
            if (player == null) throw new IllegalStateException("Point attribution does not match the saved roster.");
            return player;
        }
        TeamStatistics response() {
            return new TeamStatistics(team.getId(), team.getName(), totalPoints, attackPoints, blockPoints,
                    serviceAces, opponentErrors, unspecifiedPoints, errors, unattributedErrors,
                    players.values().stream().map(PlayerTotals::response).toList());
        }
    }
}
