package rs.stefanoluic.volleyball.match.statistics.dto;

import java.util.List;
import java.util.UUID;

public record TeamStatistics(UUID teamId, String name, long totalPoints, long attackPoints,
                             long blockPoints, long serviceAces, long opponentErrors, long unspecifiedPoints,
                             long errors, long unattributedErrors, List<PlayerStatistics> players) {}
