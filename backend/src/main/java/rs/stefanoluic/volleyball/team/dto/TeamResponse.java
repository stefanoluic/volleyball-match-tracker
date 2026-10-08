package rs.stefanoluic.volleyball.team.dto;

import rs.stefanoluic.volleyball.team.Team;

import java.time.Instant;
import java.util.UUID;

public record TeamResponse(UUID id, String name, String city, Instant createdAt) {
    public static TeamResponse from(Team team) {
        return new TeamResponse(team.getId(), team.getName(), team.getCity(), team.getCreatedAt());
    }
}
