package rs.stefanoluic.volleyball.match.roster.dto;

import rs.stefanoluic.volleyball.match.roster.MatchPlayer;
import rs.stefanoluic.volleyball.player.PlayerPosition;
import java.util.UUID;

public record MatchPlayerResponse(UUID id, UUID playerId, UUID teamId, String firstName,
                                  String lastName, int jerseyNumber, PlayerPosition position, boolean isLibero) {
    public static MatchPlayerResponse from(MatchPlayer player) {
        return new MatchPlayerResponse(player.getId(), player.getPlayer().getId(), player.getTeam().getId(),
                player.getFirstName(), player.getLastName(), player.getJerseyNumber(),
                player.getPosition(), player.isLibero());
    }
}
