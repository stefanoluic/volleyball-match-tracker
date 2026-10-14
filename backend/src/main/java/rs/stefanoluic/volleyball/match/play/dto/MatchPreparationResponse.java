package rs.stefanoluic.volleyball.match.play.dto;

import rs.stefanoluic.volleyball.match.roster.dto.MatchRosterResponse;

public record MatchPreparationResponse(MatchRosterResponse roster, MatchSetResponse firstSet) {}
