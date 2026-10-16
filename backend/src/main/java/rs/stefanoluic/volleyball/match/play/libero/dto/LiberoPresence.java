package rs.stefanoluic.volleyball.match.play.libero.dto;

import rs.stefanoluic.volleyball.match.roster.dto.MatchPlayerResponse;
import java.util.UUID;

public record LiberoPresence(UUID teamId, MatchPlayerResponse libero, MatchPlayerResponse regular,
                             int rotationPosition, boolean mustExit) {}
