package rs.stefanoluic.volleyball.match.play;

import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.match.play.libero.LiberoReplacementRepository;
import rs.stefanoluic.volleyball.match.play.score.SetPointRepository;
import rs.stefanoluic.volleyball.match.play.substitution.SetSubstitutionRepository;
import java.util.UUID;

@Service
public class SetPlayOrderService {
    private final SetPointRepository points;
    private final SetSubstitutionRepository substitutions;
    private final LiberoReplacementRepository liberos;
    public SetPlayOrderService(SetPointRepository points, SetSubstitutionRepository substitutions, LiberoReplacementRepository liberos) {
        this.points = points; this.substitutions = substitutions; this.liberos = liberos;
    }
    public boolean hasChangeAfter(UUID setId, int version) {
        return substitutions.existsBySetIdAndCancelledAtIsNullAndExpectedVersionGreaterThan(setId, version)
                || liberos.existsBySetIdAndCancelledAtIsNullAndExpectedVersionGreaterThan(setId, version);
    }
    public boolean isLatestAction(UUID setId, int version) {
        return !hasChangeAfter(setId, version)
                && !points.existsBySetIdAndCancelledAtIsNullAndExpectedVersionGreaterThan(setId, version);
    }
}
