package rs.stefanoluic.volleyball.team;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface TeamRepository extends JpaRepository<Team, UUID> {
    boolean existsByNameIgnoreCaseAndCityIgnoreCase(String name, String city);
    boolean existsByNameIgnoreCaseAndCityIgnoreCaseAndIdNot(String name, String city, UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Team t where t.id = :id")
    Optional<Team> findByIdForUpdate(UUID id);
}
