package rs.stefanoluic.volleyball.match.roster.dto;

import rs.stefanoluic.volleyball.player.dto.PlayerResponse;
import rs.stefanoluic.volleyball.team.dto.TeamResponse;
import java.util.List;

public record TeamRosterResponse(TeamResponse team, List<MatchPlayerResponse> selected,
                                List<PlayerResponse> available) {}
