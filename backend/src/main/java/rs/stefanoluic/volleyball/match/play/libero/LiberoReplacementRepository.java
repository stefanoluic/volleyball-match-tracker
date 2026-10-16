package rs.stefanoluic.volleyball.match.play.libero;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LiberoReplacementRepository extends JpaRepository<LiberoReplacement, UUID> {
    Optional<LiberoReplacement> findBySetIdAndRequestId(UUID setId, UUID requestId);
    Optional<LiberoReplacement> findBySetIdAndUndoRequestId(UUID setId, UUID requestId);
    Optional<LiberoReplacement> findByIdAndSetId(UUID id, UUID setId);
    @EntityGraph(attributePaths = {"outgoing", "outgoing.team", "outgoing.player", "incoming", "incoming.team", "incoming.player", "regular", "regular.team", "regular.player"})
    List<LiberoReplacement> findBySetIdAndCancelledAtIsNullOrderByExpectedVersionAsc(UUID setId);
    @EntityGraph(attributePaths = {"outgoing", "outgoing.team", "outgoing.player", "incoming", "incoming.team", "incoming.player"})
    List<LiberoReplacement> findBySetIdOrderByExpectedVersionDesc(UUID setId, Pageable page);
    boolean existsBySetIdAndCancelledAtIsNullAndExpectedVersionGreaterThan(UUID setId, int expectedVersion);
}
