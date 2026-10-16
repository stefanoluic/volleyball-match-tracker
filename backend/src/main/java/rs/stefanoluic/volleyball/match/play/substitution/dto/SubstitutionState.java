package rs.stefanoluic.volleyball.match.play.substitution.dto;

import java.util.List;
import java.util.UUID;

public record SubstitutionState(int homeUsed, int awayUsed, List<SubstitutionOption> options,
                                List<SubstitutionResponse> history, UUID undoableId, boolean pointUndoBlocked) {}
