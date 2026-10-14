package rs.stefanoluic.volleyball.match.play;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface SetLineupRepository extends JpaRepository<SetLineup, UUID> {
    @EntityGraph(attributePaths = {"participant", "participant.team", "participant.player"})
    List<SetLineup> findBySetIdOrderByRotationPositionAsc(UUID setId);
}
