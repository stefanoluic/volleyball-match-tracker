package rs.stefanoluic.volleyball.match.play.libero.dto;

import java.util.List;
import java.util.UUID;

public record LiberoState(List<LiberoPresence> active, List<LiberoOption> options,
                          List<LiberoReplacementResponse> history, UUID undoableId, boolean mustExit) {}
