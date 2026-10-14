package rs.stefanoluic.volleyball.match.play.dto;

import rs.stefanoluic.volleyball.match.play.SetLineup;
import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;

public record LineupPlayerResponse(int rotationPosition, MatchPlayerResponse participant) {
    public static LineupPlayerResponse from(SetLineup entry) {
        return new LineupPlayerResponse(entry.getRotationPosition(), MatchPlayerResponse.from(entry.getParticipant()));
    }
}
