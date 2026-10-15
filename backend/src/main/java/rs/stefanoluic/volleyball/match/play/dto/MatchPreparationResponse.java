package rs.stefanoluic.volleyball.match.play.dto;

import rs.stefanoluic.volleyball.match.roster.dto.MatchRosterResponse;
import java.util.List;

public record MatchPreparationResponse(MatchRosterResponse roster, MatchSetResponse firstSet,
        List<MatchSetResponse> sets, MatchSetResponse currentSet, Integer nextSetNumber,
        int homeSetsWon, int awaySetsWon) {}
