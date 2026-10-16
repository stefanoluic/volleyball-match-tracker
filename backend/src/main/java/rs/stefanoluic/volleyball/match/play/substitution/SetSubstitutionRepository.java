package rs.stefanoluic.volleyball.match.play.substitution;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SetSubstitutionRepository extends JpaRepository<SetSubstitution, UUID> {
    Optional<SetSubstitution> findBySetIdAndRequestId(UUID setId, UUID requestId);
    Optional<SetSubstitution> findBySetIdAndUndoRequestId(UUID setId, UUID requestId);
    Optional<SetSubstitution> findByIdAndSetId(UUID id, UUID setId);
    @EntityGraph(attributePaths = {"outgoing", "outgoing.team", "outgoing.player", "incoming", "incoming.team", "incoming.player"})
    List<SetSubstitution> findBySetIdAndCancelledAtIsNullOrderByExpectedVersionAsc(UUID setId);
    @EntityGraph(attributePaths = {"outgoing", "outgoing.team", "outgoing.player", "incoming", "incoming.team", "incoming.player"})
    List<SetSubstitution> findBySetIdOrderByExpectedVersionDesc(UUID setId, Pageable page);
    boolean existsBySetIdAndCancelledAtIsNullAndExpectedVersionGreaterThan(UUID setId, int expectedVersion);
}
