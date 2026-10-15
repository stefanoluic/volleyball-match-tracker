package rs.stefanoluic.volleyball.match.play.score;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class SetRotationTest {
    @Test void initialServingTeamAndNoRalliesLeaveBothSixesUnchanged() {
        assertThat(SetRotation.replay(true, 25, List.of())).isEqualTo(new SetRotation(true, 0, 0));
        assertThat(SetRotation.replay(false, 25, List.of())).isEqualTo(new SetRotation(false, 0, 0));
    }
    @Test void servingTeamWinningRepeatedlyDoesNotRotate() {
        assertThat(SetRotation.replay(true, 25, List.of(true, true, true))).isEqualTo(new SetRotation(true, 0, 0));
        assertThat(SetRotation.replay(false, 25, List.of(false, false, false))).isEqualTo(new SetRotation(false, 0, 0));
    }
    @Test void onlyReceivingWinnerRotatesAndBecomesServingTeam() {
        assertThat(SetRotation.replay(true, 25, List.of(false, false, true))).isEqualTo(new SetRotation(true, 1, 1));
        assertThat(SetRotation.replay(false, 25, List.of(true))).isEqualTo(new SetRotation(true, 1, 0));
    }
    @ParameterizedTest
    @CsvSource({"1,6", "2,1", "3,2", "4,3", "5,4", "6,5"})
    void rotationMovesTwoToOneAndOneToSix(int starting, int expected) {
        var rotation = new SetRotation(false, 0, 1);
        assertThat(rotation.position(starting, false)).isEqualTo(expected);
        assertThat(rotation.position(starting, true)).isEqualTo(starting);
    }
    @Test void sixSideOutsRestoreBothOriginalOrders() {
        var rallies = new ArrayList<Boolean>();
        for (int i = 0; i < 6; i++) { rallies.add(false); rallies.add(true); }
        assertThat(SetRotation.replay(true, 25, rallies)).isEqualTo(new SetRotation(true, 0, 0));
    }
    @Test void setWinningRallyDoesNotCreateAnotherServiceRotationIncludingTieBreak() {
        for (int target : List.of(25, 15)) {
            var rallies = new ArrayList<>(Collections.nCopies(target - 1, true));
            rallies.addAll(Collections.nCopies(target - 2, false));
            rallies.add(true);
            assertThat(SetRotation.replay(true, target, rallies)).isEqualTo(new SetRotation(true, 0, 1));
            var deuce = new ArrayList<>(Collections.nCopies(target - 1, true));
            deuce.addAll(Collections.nCopies(target - 1, false));
            deuce.add(true); deuce.add(true);
            assertThat(SetRotation.replay(true, target, deuce)).isEqualTo(new SetRotation(true, 1, 1));
        }
    }
    @Test void positionOutsideTheSixSlotsIsRejected() {
        assertThatThrownBy(() -> new SetRotation(true, 0, 0).position(0, true)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SetRotation(true, 0, 0).position(7, false)).isInstanceOf(IllegalArgumentException.class);
    }
}
