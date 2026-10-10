package rs.stefanoluic.volleyball.player.dto;

import rs.stefanoluic.volleyball.player.Player;
import rs.stefanoluic.volleyball.player.PlayerPosition;

import java.time.Instant;
import java.util.UUID;

public record PlayerResponse(UUID id, String firstName, String lastName, int jerseyNumber,
                             PlayerPosition position, UUID teamId, Instant createdAt) {
    public static PlayerResponse from(Player player) {
        return new PlayerResponse(player.getId(), player.getFirstName(), player.getLastName(),
                player.getJerseyNumber(), player.getPosition(), player.getTeam().getId(), player.getCreatedAt());
    }
}
