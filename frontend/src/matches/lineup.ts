import type { MatchPreparation, MatchRoster, StartMatchInput } from '../api/client';

export const rotationLabels = ['1 · zadnja desna', '2 · prednja desna', '3 · prednja srednja',
  '4 · prednja leva', '5 · zadnja leva', '6 · zadnja srednja'];

export function initialStartInput(data: MatchPreparation): StartMatchInput {
  const previous = data.sets?.at(-1);
  const serving = data.nextSetNumber && data.nextSetNumber < 5 && previous
    ? (previous.firstServingTeamId === data.roster.match.homeTeam.id ? data.roster.match.awayTeam.id : data.roster.match.homeTeam.id)
    : '';
  return { rosterVersion: data.roster.version, homeLineup: Array<string>(6).fill(''),
    awayLineup: Array<string>(6).fill(''), firstServingTeamId: serving };
}

export function validateStartInput(roster: MatchRoster, input: StartMatchInput): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, team] of [['homeLineup', roster.home], ['awayLineup', roster.away]] as const) {
    const ids = input[key];
    const eligible = new Set(team.selected.filter((p) => !p.isLibero).map((p) => p.id));
    if (ids.length !== 6 || ids.some((id) => !id)) errors[key] = 'Izaberite igrača za svih šest pozicija.';
    else if (new Set(ids).size !== 6) errors[key] = 'Svaki igrač može biti na samo jednoj poziciji.';
    else if (ids.some((id) => !eligible.has(id))) errors[key] = 'Birajte prijavljene igrače ovog tima koji nisu označeni kao libero.';
  }
  if (![roster.match.homeTeam.id, roster.match.awayTeam.id].includes(input.firstServingTeamId)) {
    errors.firstServingTeamId = 'Izaberite tim koji prvi servira.';
  }
  return errors;
}

export function hasStartDraft(input: StartMatchInput, initialServingTeamId = ''): boolean {
  return input.firstServingTeamId !== initialServingTeamId || [...input.homeLineup, ...input.awayLineup].some(Boolean);
}
