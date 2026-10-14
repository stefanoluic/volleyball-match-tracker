package rs.stefanoluic.volleyball.match.play;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface MatchSetRepository extends JpaRepository<MatchSet, UUID> {
    Optional<MatchSet> findByMatchIdAndNumber(UUID matchId, int number);
    boolean existsByMatchId(UUID matchId);
    Optional<MatchSet> findByIdAndMatchId(UUID id, UUID matchId);
}
