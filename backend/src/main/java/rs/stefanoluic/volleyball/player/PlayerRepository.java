package rs.stefanoluic.volleyball.player;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PlayerRepository extends JpaRepository<Player, UUID> {
    Page<Player> findByTeamId(UUID teamId, Pageable pageable);
    Optional<Player> findByIdAndTeamId(UUID id, UUID teamId);
    boolean existsByTeamId(UUID teamId);
    boolean existsByTeamIdAndJerseyNumber(UUID teamId, int jerseyNumber);
    boolean existsByTeamIdAndJerseyNumberAndIdNot(UUID teamId, int jerseyNumber, UUID id);
}
