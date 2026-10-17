package rs.stefanoluic.volleyball.match.play.score;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import rs.stefanoluic.volleyball.match.statistics.PointTotals;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SetPointRepository extends JpaRepository<SetPoint, UUID> {
    Optional<SetPoint> findBySetIdAndRequestId(UUID setId, UUID requestId);
    Optional<SetPoint> findBySetIdAndUndoRequestId(UUID setId, UUID requestId);
    Optional<SetPoint> findByIdAndSetId(UUID id, UUID setId);
    Optional<SetPoint> findFirstBySetIdAndCancelledAtIsNullOrderBySequenceNumberDesc(UUID setId);
    List<SetPoint> findBySetIdOrderBySequenceNumberDesc(UUID setId, Pageable page);
    List<SetPoint> findBySetIdAndCancelledAtIsNullOrderBySequenceNumberAsc(UUID setId);
    boolean existsBySetIdAndCancelledAtIsNullAndExpectedVersionGreaterThan(UUID setId, int expectedVersion);

    @Query("""
            select new rs.stefanoluic.volleyball.match.statistics.PointTotals(
                p.scoringTeam.id, p.actionType, p.participant.id, count(p))
            from SetPoint p
            where p.matchId = :matchId and p.cancelledAt is null
                and (:setId is null or p.set.id = :setId)
            group by p.scoringTeam.id, p.actionType, p.participant.id
            """)
    List<PointTotals> summarize(UUID matchId, UUID setId);
}
