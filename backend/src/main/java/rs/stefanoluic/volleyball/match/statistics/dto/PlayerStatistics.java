package rs.stefanoluic.volleyball.match.statistics.dto;

import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;

public record PlayerStatistics(MatchPlayerResponse participant, long attackPoints, long blockPoints,
                               long serviceAces, long scoringPoints, long errors) {}
