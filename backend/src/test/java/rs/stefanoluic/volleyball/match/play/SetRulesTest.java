package rs.stefanoluic.volleyball.match.play;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import rs.stefanoluic.volleyball.match.Match;
import rs.stefanoluic.volleyball.team.Team;
import java.time.Instant;
import static org.assertj.core.api.Assertions.assertThat;

class SetRulesTest {
    @ParameterizedTest
    @CsvSource({
        "1,24,0,false", "1,25,23,true", "1,25,24,false", "1,24,24,false",
        "2,26,24,true", "3,26,25,false", "4,27,25,true", "1,23,25,true",
        "5,14,0,false", "5,15,13,true", "5,15,14,false", "5,14,14,false",
        "5,16,14,true", "5,16,15,false", "5,14,16,true", "5,22,20,true"
    })
    void detectsWinningScore(int number, int homeScore, int awayScore, boolean expected) {
        Team home = new Team("Home", "Novi Sad"), away = new Team("Away", "Beograd");
        MatchSet set = new MatchSet(new Match(home, away, Instant.now()), number, home);
        for (int i = 0; i < homeScore; i++) set.recordPoint(true);
        for (int i = 0; i < awayScore; i++) set.recordPoint(false);
        assertThat(set.hasWinningScore()).isEqualTo(expected);
        assertThat(set.getTargetScore()).isEqualTo(number == 5 ? 15 : 25);
    }
}
