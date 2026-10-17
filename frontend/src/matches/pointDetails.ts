import type { Match, MatchPlayer, PointActionType, SetScore } from '../api/client';

export const pointActionLabels: Record<PointActionType, string> = {
  UNSPECIFIED: 'Bez detalja', ATTACK: 'Poen napadom', BLOCK: 'Poen blokom',
  SERVICE_ACE: 'Servis-as', OPPONENT_ERROR: 'Greška protivnika',
};

export const pointPlayerLabel = (player: MatchPlayer) =>
  '#' + player.jerseyNumber + ' ' + player.firstName + ' ' + player.lastName;

// The server validates these again, using the same pre-rally court and score version.
export function pointPlayerOptions(match: Match, score: SetScore, scoringTeamId: string, type: PointActionType): MatchPlayer[] {
  const court = score.court;
  if (!court || type === 'UNSPECIFIED') return [];
  const useHome = (scoringTeamId === match.homeTeam.id) !== (type === 'OPPONENT_ERROR');
  const rows = useHome ? court.homeLineup : court.awayLineup;
  if (type === 'SERVICE_ACE') return court.servingTeamId === scoringTeamId && court.server ? [court.server] : [];
  return rows.filter((row) => type !== 'BLOCK'
    || (!row.participant.isLibero && row.rotationPosition >= 2 && row.rotationPosition <= 4))
    .map((row) => row.participant);
}
