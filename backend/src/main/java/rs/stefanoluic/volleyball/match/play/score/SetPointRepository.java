package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SetPointRepository extends JpaRepository<SetPoint, UUID> {
    Optional<SetPoint> findBySetIdAndRequestId(UUID setId, UUID requestId);
    Optional<SetPoint> findBySetIdAndUndoRequestId(UUID setId, UUID requestId);
    Optional<SetPoint> findByIdAndSetId(UUID id, UUID setId);
    Optional<SetPoint> findFirstBySetIdAndCancelledAtIsNullOrderBySequenceNumberDesc(UUID setId);
    List<SetPoint> findBySetIdOrderBySequenceNumberDesc(UUID setId, Pageable page);
}
