package rs.stefanoluic.volleyball.match.roster;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface MatchPlayerRepository extends JpaRepository<MatchPlayer, UUID> {
    List<MatchPlayer> findByMatchIdOrderByJerseyNumberAscIdAsc(UUID matchId);
    boolean existsByMatchId(UUID matchId);
    boolean existsByPlayerId(UUID playerId);
}
