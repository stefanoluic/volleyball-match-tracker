import type { MatchRoster, MatchRosterInput, PlayerInput, RosterPlayerInput, TeamRoster } from '../api/client';

type RosterRow = PlayerInput & { playerId: string };

export function initialRosterInput(roster: MatchRoster): MatchRosterInput {
  const selection = (team: TeamRoster) => team.selected.map(({ playerId, isLibero }) => ({ playerId, isLibero }));
  return { version: roster.version, homePlayers: selection(roster.home), awayPlayers: selection(roster.away) };
}

export function rosterRows(team: TeamRoster, readOnly = false) {
  const rows = new Map<string, RosterRow>(team.available.map((player) => [player.id, { ...player, playerId: player.id }]));
  if (readOnly) rows.clear();
  // Saved names, positions and jersey numbers belong to the match, not the current club roster.
  for (const player of team.selected) rows.set(player.playerId, player);
  return [...rows.values()].sort((a, b) => a.jerseyNumber - b.jerseyNumber || a.playerId.localeCompare(b.playerId));
}

export function validateRosterInput(roster: MatchRoster, input: MatchRosterInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const ids = new Set<string>();
  for (const [key, team] of [['homePlayers', roster.home], ['awayPlayers', roster.away]] as const) {
    const selected = input[key];
    const rows = new Map(rosterRows(team).map((player) => [player.playerId, player]));
    const jerseys = new Set<number>();
    if (selected.filter((player) => player.isLibero).length > 2) errors[key] = 'U jednom timu možete označiti najviše dva libera.';
    for (const player of selected) {
      const row = rows.get(player.playerId);
      if (!row) errors[key] = 'Izabrani igrač ne pripada ovom sastavu.';
      else if (jerseys.has(row.jerseyNumber)) errors[key] = 'Izabrani igrači imaju isti broj dresa u podacima za ovaj meč.';
      else jerseys.add(row.jerseyNumber);
      if (ids.has(player.playerId)) errors[key] = 'Isti igrač ne može biti dodat dva puta.';
      ids.add(player.playerId);
    }
  }
  return errors;
}

export function sameSelection(first: RosterPlayerInput[], second: RosterPlayerInput[]): boolean {
  return first.length === second.length && first.every((player) =>
    second.some((other) => other.playerId === player.playerId && other.isLibero === player.isLibero));
}
