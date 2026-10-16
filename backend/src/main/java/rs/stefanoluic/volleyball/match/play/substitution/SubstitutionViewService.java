package rs.stefanoluic.volleyball.match.play.substitution;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.match.MatchStatus;
import rs.stefanoluic.volleyball.match.play.*;
import rs.stefanoluic.volleyball.match.play.score.SetPoint;
import rs.stefanoluic.volleyball.match.play.score.dto.SetCourtResponse;
import rs.stefanoluic.volleyball.match.play.substitution.dto.*;
import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.util.*;

@Service
public class SubstitutionViewService {
    private final SetSubstitutionRepository substitutions;
    private final SetLineupRepository lineups;
    private final MatchPlayerRepository participants;
    private final SetPlayOrderService order;

    public SubstitutionViewService(SetSubstitutionRepository substitutions, SetLineupRepository lineups,
                                    MatchPlayerRepository participants, SetPlayOrderService order) {
        this.substitutions = substitutions; this.lineups = lineups; this.participants = participants;
        this.order = order;
    }

    public SubstitutionState get(MatchSet set, SetCourtResponse court, SetPoint lastPoint, boolean liberoMustExit) {
        var active = substitutions.findBySetIdAndCancelledAtIsNullOrderByExpectedVersionAsc(set.getId());
        UUID homeId = set.getMatch().getHomeTeam().getId();
        int homeUsed = (int) active.stream().filter(row -> row.getTeamId().equals(homeId)).count();
        boolean live = set.getStatus() == MatchSetStatus.LIVE && set.getMatch().getStatus() == MatchStatus.LIVE;
        var last = active.isEmpty() ? null : active.getLast();
        boolean laterSubstitution = lastPoint != null && order.hasChangeAfter(set.getId(), lastPoint.getExpectedVersion());
        UUID undoable = live && last != null && order.isLatestAction(set.getId(), last.getExpectedVersion()) ? last.getId() : null;
        var options = new ArrayList<SubstitutionOption>();
        if (live && !set.hasWinningScore() && court != null && !liberoMustExit) {
            var starting = lineups.findBySetIdOrderByRotationPositionAsc(set.getId());
            var roster = participants.findByMatchIdOrderByJerseyNumberAscIdAsc(set.getMatch().getId());
            for (UUID teamId : List.of(homeId, set.getMatch().getAwayTeam().getId())) {
                var teamChanges = active.stream().filter(row -> row.getTeamId().equals(teamId)).toList();
                int afterPoint = lastPoint == null ? 0 : lastPoint.getSequenceNumber();
                if (teamChanges.size() >= 6 || (!teamChanges.isEmpty() && teamChanges.getLast().getAfterPointSequence() == afterPoint)) continue;
                var six = starting.stream().filter(row -> row.getParticipant().getTeam().getId().equals(teamId)).toList();
                Set<UUID> starters = new HashSet<>();
                six.forEach(row -> starters.add(row.getParticipant().getId()));
                Set<UUID> usedReserves = new HashSet<>();
                teamChanges.forEach(row -> usedReserves.add(row.getIncoming().getId()));
                for (var slot : six) {
                    var slotChanges = teamChanges.stream().filter(row -> row.getStartingPosition() == slot.getRotationPosition()).toList();
                    MatchPlayer outgoing;
                    List<MatchPlayerResponse> incoming;
                    if (slotChanges.isEmpty()) {
                        outgoing = slot.getParticipant();
                        incoming = roster.stream().filter(player -> player.getTeam().getId().equals(teamId) && !player.isLibero()
                                && !starters.contains(player.getId()) && !usedReserves.contains(player.getId()))
                                .map(MatchPlayerResponse::from).toList();
                    } else if (slotChanges.size() == 1) {
                        outgoing = slotChanges.getFirst().getIncoming();
                        incoming = List.of(MatchPlayerResponse.from(slot.getParticipant()));
                    } else continue;
                    var actualSix = teamId.equals(homeId) ? court.homeLineup() : court.awayLineup();
                    UUID outgoingId = outgoing.getId();
                    boolean onCourt = actualSix.stream().anyMatch(row -> row.participant().id().equals(outgoingId));
                    if (onCourt && !incoming.isEmpty()) options.add(new SubstitutionOption(teamId, slot.getRotationPosition(),
                            MatchPlayerResponse.from(outgoing), incoming));
                }
            }
        }
        var history = substitutions.findBySetIdOrderByExpectedVersionDesc(set.getId(), PageRequest.of(0, 20))
                .stream().map(SubstitutionResponse::from).toList();
        return new SubstitutionState(homeUsed, active.size() - homeUsed, options, history, undoable, live && laterSubstitution);
    }
}
