package rs.stefanoluic.volleyball.match.roster.dto;

import rs.stefanoluic.volleyball.match.dto.MatchResponse;

public record MatchRosterResponse(MatchResponse match, int version,
                                  TeamRosterResponse home, TeamRosterResponse away) {}
