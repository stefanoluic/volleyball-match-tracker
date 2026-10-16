package rs.stefanoluic.volleyball.match.play.libero;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.match.MatchStatus;
import rs.stefanoluic.volleyball.match.play.*;
import rs.stefanoluic.volleyball.match.play.libero.dto.*;
import rs.stefanoluic.volleyball.match.play.score.SetPoint;
import rs.stefanoluic.volleyball.match.play.score.dto.SetCourtResponse;
import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitutionRepository;
import rs.stefanoluic.volleyball.match.roster.MatchPlayerRepository;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.util.*;

@Service
public class LiberoViewService {
    private final LiberoReplacementRepository replacements;
    private final SetLineupRepository lineups;
    private final SetSubstitutionRepository substitutions;
    private final MatchPlayerRepository participants;
    private final SetPlayOrderService order;
    public LiberoViewService(LiberoReplacementRepository replacements, SetLineupRepository lineups,
                             SetSubstitutionRepository substitutions, MatchPlayerRepository participants, SetPlayOrderService order) {
        this.replacements = replacements; this.lineups = lineups; this.substitutions = substitutions;
        this.participants = participants; this.order = order;
    }
    public LiberoState get(MatchSet set, SetCourtResponse court, SetPoint lastPoint) {
        var rows = replacements.findBySetIdAndCancelledAtIsNullOrderByExpectedVersionAsc(set.getId());
        var active = presence(set, court, rows);
        boolean live = set.getStatus() == MatchSetStatus.LIVE && set.getMatch().getStatus() == MatchStatus.LIVE;
        var options = new ArrayList<LiberoOption>();
        if (live && !set.hasWinningScore() && court != null) {
            var roster = participants.findByMatchIdOrderByJerseyNumberAscIdAsc(set.getMatch().getId());
            var starting = lineups.findBySetIdOrderByRotationPositionAsc(set.getId());
            var ordinary = substitutions.findBySetIdAndCancelledAtIsNullOrderByExpectedVersionAsc(set.getId());
            for (UUID teamId : List.of(set.getMatch().getHomeTeam().getId(), set.getMatch().getAwayTeam().getId())) {
                var teamRows = rows.stream().filter(row -> row.getTeamId().equals(teamId)).toList();
                int afterPoint = lastPoint == null ? 0 : lastPoint.getSequenceNumber();
                if (!teamRows.isEmpty() && teamRows.getLast().getAfterPointSequence() == afterPoint) continue;
                var liberos = roster.stream().filter(player -> player.getTeam().getId().equals(teamId) && player.isLibero())
                        .map(MatchPlayerResponse::from).toList();
                var current = active.stream().filter(row -> row.teamId().equals(teamId)).findFirst().orElse(null);
                if (current != null) {
                    var incoming = new ArrayList<MatchPlayerResponse>(); incoming.add(current.regular());
                    if (!current.mustExit()) incoming.addAll(liberos.stream().filter(player -> !player.id().equals(current.libero().id())).toList());
                    options.add(new LiberoOption(teamId, teamRows.getLast().getStartingPosition(), current.regular().id(), current.libero(), incoming));
                } else {
                    var six = teamId.equals(set.getMatch().getHomeTeam().getId()) ? court.homeLineup() : court.awayLineup();
                    for (var row : six) {
                        int position = row.rotationPosition();
                        if (position != 1 && position != 5 && position != 6) continue;
                        if (position == 1 && teamId.equals(court.servingTeamId())) continue;
                        for (var initial : starting) {
                            if (!initial.getParticipant().getTeam().getId().equals(teamId)) continue;
                            var occupant = initial.getParticipant();
                            for (var change : ordinary) if (change.getTeamId().equals(teamId)
                                    && change.getStartingPosition() == initial.getRotationPosition()) occupant = change.getIncoming();
                            if (occupant.getId().equals(row.participant().id()) && !liberos.isEmpty())
                                options.add(new LiberoOption(teamId, initial.getRotationPosition(), occupant.getId(), row.participant(), liberos));
                        }
                    }
                }
            }
        }
        var last = rows.isEmpty() ? null : rows.getLast();
        UUID undoable = live && last != null && order.isLatestAction(set.getId(), last.getExpectedVersion()) ? last.getId() : null;
        var history = replacements.findBySetIdOrderByExpectedVersionDesc(set.getId(), PageRequest.of(0, 20))
                .stream().map(LiberoReplacementResponse::from).toList();
        return new LiberoState(active, options, history, undoable, active.stream().anyMatch(LiberoPresence::mustExit));
    }
    public boolean requiresExit(MatchSet set, SetCourtResponse court) {
        return presence(set, court, replacements.findBySetIdAndCancelledAtIsNullOrderByExpectedVersionAsc(set.getId()))
                .stream().anyMatch(LiberoPresence::mustExit);
    }
    private List<LiberoPresence> presence(MatchSet set, SetCourtResponse court, List<LiberoReplacement> rows) {
        if (court == null) return List.of();
        boolean live = set.getStatus() == MatchSetStatus.LIVE && set.getMatch().getStatus() == MatchStatus.LIVE && !set.hasWinningScore();
        var result = new ArrayList<LiberoPresence>();
        for (UUID teamId : List.of(set.getMatch().getHomeTeam().getId(), set.getMatch().getAwayTeam().getId())) {
            var last = rows.stream().filter(row -> row.getTeamId().equals(teamId)).reduce((a, b) -> b).orElse(null);
            if (last == null || !last.getIncoming().isLibero()) continue;
            var six = teamId.equals(set.getMatch().getHomeTeam().getId()) ? court.homeLineup() : court.awayLineup();
            var occupant = six.stream().filter(row -> row.participant().id().equals(last.getIncoming().getId())).findFirst().orElse(null);
            if (occupant == null) continue;
            int position = occupant.rotationPosition();
            boolean mustExit = live && ((position >= 2 && position <= 4) || (position == 1 && teamId.equals(court.servingTeamId())));
            result.add(new LiberoPresence(teamId, MatchPlayerResponse.from(last.getIncoming()), MatchPlayerResponse.from(last.getRegular()), position, mustExit));
        }
        return result;
    }
}
