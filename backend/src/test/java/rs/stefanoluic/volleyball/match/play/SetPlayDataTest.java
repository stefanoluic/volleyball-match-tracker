package rs.stefanoluic.volleyball.match.play;

import org.junit.jupiter.api.Test;
import rs.stefanoluic.volleyball.match.play.libero.LiberoReplacement;
import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitution;
import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import rs.stefanoluic.volleyball.team.Team;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class SetPlayDataTest {
    private final UUID teamId = UUID.randomUUID();
    private final MatchPlayer starter = mock(MatchPlayer.class);
    private final MatchPlayer reserve = mock(MatchPlayer.class);
    private final MatchPlayer libero = mock(MatchPlayer.class);

    private SetLineup slot() {
        var team = mock(Team.class);
        when(team.getId()).thenReturn(teamId);
        when(starter.getTeam()).thenReturn(team);
        var slot = mock(SetLineup.class);
        when(slot.getParticipant()).thenReturn(starter);
        when(slot.getRotationPosition()).thenReturn(5);
        return slot;
    }

    private SetSubstitution substitution(UUID team, int position, int version, MatchPlayer incoming) {
        var change = mock(SetSubstitution.class);
        when(change.getTeamId()).thenReturn(team);
        when(change.getStartingPosition()).thenReturn(position);
        when(change.getExpectedVersion()).thenReturn(version);
        when(change.getIncoming()).thenReturn(incoming);
        return change;
    }

    private LiberoReplacement replacement(UUID team, int position, int version, MatchPlayer incoming) {
        var change = mock(LiberoReplacement.class);
        when(change.getTeamId()).thenReturn(team);
        when(change.getStartingPosition()).thenReturn(position);
        when(change.getExpectedVersion()).thenReturn(version);
        when(change.getIncoming()).thenReturn(incoming);
        return change;
    }

    private SetPlayData history(List<SetSubstitution> changes, List<LiberoReplacement> liberos) {
        return new SetPlayData(List.of(), List.of(), changes, liberos, List.of());
    }

    @Test void unchangedSlotKeepsItsStarter() {
        var slot = slot();
        var data = history(List.of(), List.of());
        assertThat(data.regularOccupant(slot)).isSameAs(starter);
        assertThat(data.currentOccupant(slot)).isSameAs(starter);
    }

    @Test void newerOrdinaryReturnOverridesTheEarlierLiberoReturn() {
        var slot = slot();
        var data = history(List.of(substitution(teamId, 5, 1, reserve), substitution(teamId, 5, 5, starter)),
                List.of(replacement(teamId, 5, 2, libero), replacement(teamId, 5, 4, reserve)));
        assertThat(data.regularOccupant(slot)).isSameAs(starter);
        assertThat(data.currentOccupant(slot)).isSameAs(starter);
    }

    @Test void latestLiberoCoversTheCurrentRegularPlayer() {
        var slot = slot();
        var otherLibero = mock(MatchPlayer.class);
        var data = history(List.of(substitution(teamId, 5, 1, reserve)),
                List.of(replacement(teamId, 5, 2, libero), replacement(teamId, 5, 4, otherLibero)));
        assertThat(data.regularOccupant(slot)).isSameAs(reserve);
        assertThat(data.currentOccupant(slot)).isSameAs(otherLibero);
    }

    @Test void changesInOtherTeamsAndSlotsDoNotAffectThePlayer() {
        var slot = slot();
        var otherTeam = UUID.randomUUID();
        var data = history(List.of(substitution(teamId, 5, 1, reserve),
                        substitution(teamId, 4, 6, starter), substitution(otherTeam, 5, 7, starter)),
                List.of(replacement(teamId, 4, 8, libero), replacement(otherTeam, 5, 9, libero)));
        assertThat(data.regularOccupant(slot)).isSameAs(reserve);
        assertThat(data.currentOccupant(slot)).isSameAs(reserve);
    }
}
