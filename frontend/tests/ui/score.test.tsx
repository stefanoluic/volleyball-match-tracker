import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type LineupPlayer, type Match, type MatchPreparation, type MatchSet, type SetPoint, type SetScore, type Team } from '../../src/api/client';
import { MatchScoreboard } from '../../src/matches/MatchScoreboard';
import { theme } from '../../src/theme';

const home: Team = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-14T12:00:00Z' };
const away: Team = { ...home, id: 'away', name: 'Partizan' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'LIVE',
  scheduledAt: home.createdAt, createdAt: home.createdAt };
const set: MatchSet = { id: 'set', number: 1, status: 'LIVE', homeScore: 0, awayScore: 0,
  firstServingTeamId: home.id, startedAt: home.createdAt, homeLineup: [], awayLineup: [],
  scoreVersion: 0, finishedAt: null, winnerTeamId: null };
const zero: SetScore = { setId: set.id, version: 0, homeScore: 0, awayScore: 0,
  matchStatus: 'LIVE', setStatus: 'LIVE', canRecord: true, lastActivePoint: null, points: [],
  canUndo: false, canFinish: false, winnerTeamId: null, court: null, substitutions: null, libero: null };
const point: SetPoint = { id: 'point', sequenceNumber: 1, scoringTeamId: home.id,
  homeScoreAfter: 1, awayScoreAfter: 0, createdAt: home.createdAt, cancelledAt: null };
const one: SetScore = { ...zero, version: 1, homeScore: 1, lastActivePoint: point, points: [point], canUndo: true };
const undone: SetScore = { ...zero, version: 2, points: [{ ...point, cancelledAt: '2026-10-14T12:01:00Z' }] };

beforeEach(() => {
  vi.spyOn(api, 'setScore').mockResolvedValue(zero);
  vi.spyOn(notifications, 'show').mockReturnValue('notice');
});
afterEach(() => vi.restoreAllMocks());
function renderBoard(canManage = true) {
  const busy = vi.fn();
  render(<MantineProvider theme={theme} env="test">
    <MatchScoreboard match={match} set={set} canManage={canManage} onBusyChange={busy} />
  </MantineProvider>);
  return busy;
}
async function loaded() { await screen.findByText('Vojvodina 0 : 0 Partizan'); }
function addHome() { fireEvent.click(screen.getByRole('button', { name: 'Poen za domaćina' })); }
function openUndo() { fireEvent.click(screen.getByRole('button', { name: 'Poništi poslednji poen' })); }
function confirmUndo() { fireEvent.click(screen.getByRole('button', { name: 'Potvrdi poništavanje' })); }

test('initial score has empty history and disables undo', async () => {
  renderBoard(); await loaded();
  expect(screen.getByText('Još nema unetih poena.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Poništi poslednji poen' }) as HTMLButtonElement).disabled).toBe(true);
});
test('adding updates authoritative score and sends current version with a unique command ID', async () => {
  const write = vi.spyOn(api, 'addPoint').mockResolvedValueOnce(one).mockResolvedValue({ ...one,
    version: 2, awayScore: 1, lastActivePoint: { ...point, id: 'other', scoringTeamId: away.id, sequenceNumber: 2 } });
  renderBoard(); await loaded(); addHome();
  await screen.findByText('Vojvodina 1 : 0 Partizan');
  expect(write).toHaveBeenCalledWith(match.id, set.id, {
    version: 0, scoringTeamId: home.id, requestId: expect.stringMatching(/^[a-f0-9-]{36}$/),
  });
  expect(screen.getByText('#1 · Poen za Vojvodina')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Poen za gosta' }));
  await screen.findByText('Vojvodina 1 : 1 Partizan');
  expect(write).toHaveBeenLastCalledWith(match.id, set.id, expect.objectContaining({ version: 1, scoringTeamId: away.id }));
  expect(write.mock.calls[0][2].requestId).not.toBe(write.mock.calls[1][2].requestId);
});
test('coach only reads score and manually refreshes without write controls', async () => {
  const write = vi.spyOn(api, 'addPoint');
  renderBoard(false); await loaded();
  expect(screen.queryByRole('button', { name: 'Poen za domaćina' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Poništi poslednji poen' })).toBeNull();
  vi.mocked(api.setScore).mockResolvedValue(one);
  fireEvent.click(screen.getByRole('button', { name: 'Osveži rezultat' }));
  await screen.findByText('Vojvodina 1 : 0 Partizan');
  expect(write).not.toHaveBeenCalled();
});
test('undo needs inline confirmation, preserves history and restores 0:0', async () => {
  vi.mocked(api.setScore).mockResolvedValue(one);
  const write = vi.spyOn(api, 'undoPoint').mockResolvedValue(undone);
  renderBoard(); await screen.findByText('Vojvodina 1 : 0 Partizan');
  openUndo();
  expect(write).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Odustani' }));
  expect(write).not.toHaveBeenCalled();
  openUndo(); confirmUndo();
  await screen.findByText('Vojvodina 0 : 0 Partizan');
  expect(write).toHaveBeenCalledExactlyOnceWith(match.id, set.id, point.id, {
    version: 1, requestId: expect.any(String),
  });
  expect(screen.getByText('Poništen')).toBeTruthy();
  expect(screen.getByText('#1 · Poen za Vojvodina')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Poništi poslednji poen' }) as HTMLButtonElement).disabled).toBe(true);
});
test('pending write disables repeated clicks and notifies parent navigation guard', async () => {
  let resolve!: (score: SetScore) => void;
  const write = vi.spyOn(api, 'addPoint').mockReturnValue(new Promise((done) => { resolve = done; }));
  const busy = renderBoard(); await loaded(); addHome(); addHome();
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect((screen.getByRole('button', { name: 'Poen za gosta' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Osveži rezultat' }) as HTMLButtonElement).disabled).toBe(true);
  expect(busy).toHaveBeenCalledWith(true);
  await act(async () => resolve(one));
  await screen.findByText('Vojvodina 1 : 0 Partizan');
  expect(busy).toHaveBeenLastCalledWith(false);
});
test('stale version freezes writes until explicit reload, without changing displayed score', async () => {
  vi.spyOn(api, 'addPoint').mockRejectedValue(new ApiError('Rezultat je promenjen.', 409));
  renderBoard(); await loaded(); addHome();
  await screen.findByText('Rezultat je promenjen.');
  expect(screen.getByText('Vojvodina 0 : 0 Partizan')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Poen za gosta' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Ponovi isti zahtev' })).toBeNull();
  vi.mocked(api.setScore).mockResolvedValue(one);
  fireEvent.click(screen.getByRole('button', { name: 'Osveži rezultat' }));
  await screen.findByText('Vojvodina 1 : 0 Partizan');
  expect(screen.queryByText('Rezultat je promenjen.')).toBeNull();
  expect((screen.getByRole('button', { name: 'Poen za gosta' }) as HTMLButtonElement).disabled).toBe(false);
});
for (const failure of [new Error('connection lost'), new ApiError('Server nije odgovorio.', 503)]) {
  test('uncertain add can only retry the same command: ' + failure.message, async () => {
    const write = vi.spyOn(api, 'addPoint').mockRejectedValueOnce(failure).mockResolvedValue(one);
    renderBoard(); await loaded(); addHome();
    await screen.findByRole('button', { name: 'Ponovi isti zahtev' });
    expect((screen.getByRole('button', { name: 'Poen za gosta' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ponovi isti zahtev' }));
    await screen.findByText('Vojvodina 1 : 0 Partizan');
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
    expect(screen.queryByRole('button', { name: 'Ponovi isti zahtev' })).toBeNull();
  });
}
test('uncertain undo retries original target and version rather than cancelling another point', async () => {
  vi.mocked(api.setScore).mockResolvedValue(one);
  const write = vi.spyOn(api, 'undoPoint').mockRejectedValueOnce(new Error('lost response')).mockResolvedValue(undone);
  renderBoard(); await screen.findByText('Vojvodina 1 : 0 Partizan'); openUndo(); confirmUndo();
  fireEvent.click(await screen.findByRole('button', { name: 'Ponovi isti zahtev' }));
  await screen.findByText('Vojvodina 0 : 0 Partizan');
  expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
  expect(screen.getByText('Poništen')).toBeTruthy();
});
test('load failure is recoverable and never enables score writes', async () => {
  const write = vi.spyOn(api, 'addPoint').mockResolvedValue(one);
  vi.mocked(api.setScore).mockRejectedValueOnce(new ApiError('Rezultat nije dostupan.', 503));
  renderBoard(); await screen.findByText('Rezultat nije dostupan.');
  expect(screen.queryByRole('button', { name: 'Poen za domaćina' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Osveži rezultat' }));
  await loaded(); addHome();
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
});
test('finished match or set exposes read-only scoreboard even to statistician', async () => {
  vi.mocked(api.setScore).mockResolvedValue({ ...one, setStatus: 'FINISHED', canRecord: false, canUndo: false });
  renderBoard(); await screen.findByText('Vojvodina 1 : 0 Partizan');
  expect(screen.getByText('Završen')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Poen za domaćina' })).toBeNull();
  expect(screen.getByText('Unos nije dostupan jer utakmica ili set nisu u toku.')).toBeTruthy();
});

const winning: SetScore = { ...one, version: 48, homeScore: 25, awayScore: 23,
  canRecord: false, canUndo: true, canFinish: true, winnerTeamId: home.id };
const closedSet: MatchSet = { ...set, status: 'FINISHED', homeScore: 25, awayScore: 23,
  scoreVersion: 49, finishedAt: home.createdAt, winnerTeamId: home.id };
const completed: MatchPreparation = { roster: { match, version: 0,
  home: { team: home, selected: [], available: [] }, away: { team: away, selected: [], available: [] } },
  firstSet: closedSet, sets: [closedSet], currentSet: null, nextSetNumber: 2, homeSetsWon: 1, awaySetsWon: 0 };
test('winning score disables additions but still allows undo until finish is confirmed', async () => {
  vi.mocked(api.setScore).mockResolvedValue(winning);
  const finish = vi.spyOn(api, 'finishSet').mockResolvedValue(completed);
  renderBoard(); await screen.findByText('Vojvodina 25 : 23 Partizan');
  expect((screen.getByRole('button', { name: 'Poen za domaćina' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Poništi poslednji poen' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Završi set' }));
  expect(finish).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Odustani od završavanja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Završi set' }));
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi kraj seta' }));
  await screen.findByText('Završen');
  expect(finish).toHaveBeenCalledExactlyOnceWith(match.id, set.id, { version: 48, requestId: expect.any(String) });
  expect(screen.queryByRole('button', { name: 'Poništi poslednji poen' })).toBeNull();
});
test('uncertain set completion retries the same identifier and never closes a different set', async () => {
  vi.mocked(api.setScore).mockResolvedValue(winning);
  const finish = vi.spyOn(api, 'finishSet').mockRejectedValueOnce(new Error('lost finish response')).mockResolvedValue(completed);
  renderBoard(); await screen.findByText('Vojvodina 25 : 23 Partizan');
  fireEvent.click(screen.getByRole('button', { name: 'Završi set' }));
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi kraj seta' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ponovi isti zahtev' }));
  await screen.findByText('Završen');
  expect(finish.mock.calls[1]).toEqual(finish.mock.calls[0]);
});

function sixes(team: Team, turns = 0): LineupPlayer[] {
  return Array.from({ length: 6 }, (_, index) => ({ rotationPosition: (index - turns + 6) % 6 + 1,
    participant: { id: team.id + '-entry-' + (index + 1), playerId: team.id + '-player-' + (index + 1),
      teamId: team.id, firstName: team.id === home.id ? 'Marko' : 'Petar', lastName: 'Marković',
      jerseyNumber: index + 1, position: 'SETTER' as const, isLibero: false } }))
    .sort((a, b) => a.rotationPosition - b.rotationPosition);
}
const homeSix = sixes(home), awaySix = sixes(away);
const initialCourt: SetScore = { ...zero, court: { servingTeamId: home.id, server: homeSix[0].participant,
  homeLineup: homeSix, awayLineup: awaySix } };
const sideOutCourt: SetScore = { ...one, homeScore: 0, awayScore: 1,
  lastActivePoint: { ...point, scoringTeamId: away.id }, points: [{ ...point, scoringTeamId: away.id }],
  court: { servingTeamId: away.id, server: sixes(away, 1)[0].participant,
    homeLineup: homeSix, awayLineup: sixes(away, 1) } };

test('court shows twelve players in court order and highlights the position-one server', async () => {
  vi.mocked(api.setScore).mockResolvedValue(initialCourt);
  renderBoard(); await loaded();
  expect(screen.getByText('Na servisu: Vojvodina · #1 Marko Marković')).toBeTruthy();
  const homeCourt = screen.getByRole('list', { name: 'Mesta u rotaciji · Vojvodina' });
  expect(within(homeCourt).getAllByRole('listitem').map((row) => row.getAttribute('aria-label')))
    .toEqual([4, 3, 2, 5, 6, 1].map((n) => 'Pozicija ' + n + ' · #' + n + ' Marko Marković'));
  expect(within(homeCourt).getByRole('listitem', { name: 'Pozicija 1 · #1 Marko Marković' }).getAttribute('aria-current')).toBe('true');
  expect(screen.getAllByRole('listitem')).toHaveLength(12);
  expect(screen.getAllByText('Servira')).toHaveLength(1);
});
test('side-out uses server response to rotate only the receiving winner', async () => {
  vi.mocked(api.setScore).mockResolvedValue(initialCourt);
  vi.spyOn(api, 'addPoint').mockResolvedValue(sideOutCourt);
  renderBoard(); await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Poen za gosta' }));
  await screen.findByText('Na servisu: Partizan · #2 Petar Marković');
  const awayCourt = screen.getByRole('region', { name: 'Raspored · Partizan' });
  expect(within(awayCourt).getByRole('listitem', { name: 'Pozicija 1 · #2 Petar Marković' }).getAttribute('aria-current')).toBe('true');
  const homeCourt = screen.getByRole('region', { name: 'Raspored · Vojvodina' });
  expect(within(homeCourt).getByRole('listitem', { name: 'Pozicija 1 · #1 Marko Marković' })).toBeTruthy();
  expect(within(homeCourt).queryByText('Servira')).toBeNull();
});
test('undo restores previous serving team and rotational positions', async () => {
  vi.mocked(api.setScore).mockResolvedValue(sideOutCourt);
  vi.spyOn(api, 'undoPoint').mockResolvedValue({ ...initialCourt, version: 2 });
  renderBoard(); await screen.findByText('Na servisu: Partizan · #2 Petar Marković');
  openUndo(); confirmUndo();
  await screen.findByText('Na servisu: Vojvodina · #1 Marko Marković');
  const awayCourt = screen.getByRole('region', { name: 'Raspored · Partizan' });
  expect(within(awayCourt).getByRole('listitem', { name: 'Pozicija 1 · #1 Petar Marković' })).toBeTruthy();
});
test('coach refreshes authoritative court without any court editing controls', async () => {
  vi.mocked(api.setScore).mockResolvedValue(initialCourt);
  renderBoard(false); await loaded();
  expect(screen.getByText('Na servisu: Vojvodina · #1 Marko Marković')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Poen za gosta' })).toBeNull();
  vi.mocked(api.setScore).mockResolvedValue(sideOutCourt);
  fireEvent.click(screen.getByRole('button', { name: 'Osveži rezultat' }));
  await screen.findByText('Na servisu: Partizan · #2 Petar Marković');
});
test('uncertain writes hide potentially stale court until the original request succeeds', async () => {
  vi.mocked(api.setScore).mockResolvedValue(initialCourt);
  vi.spyOn(api, 'addPoint').mockRejectedValueOnce(new Error('lost')).mockResolvedValue(sideOutCourt);
  renderBoard(); await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Poen za gosta' }));
  const retry = await screen.findByRole('button', { name: 'Ponovi isti zahtev' });
  expect(screen.queryByRole('region', { name: 'Rotacioni raspored' })).toBeNull();
  fireEvent.click(retry);
  await screen.findByText('Na servisu: Partizan · #2 Petar Marković');
});
test('winning and finished sets do not highlight or announce a next server', async () => {
  vi.mocked(api.setScore).mockResolvedValue({ ...winning, court: { ...initialCourt.court!, servingTeamId: null, server: null } });
  vi.spyOn(api, 'finishSet').mockResolvedValue(completed);
  renderBoard();
  await screen.findByText('Čeka se potvrda kraja seta — nema narednog servisa.');
  expect(screen.queryByText(/^Na servisu:/)).toBeNull();
  expect(screen.queryByText('Servira')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Završi set' }));
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi kraj seta' }));
  await screen.findByText('Nema narednog servisa — set ili utakmica nisu u toku.');
  expect(screen.getAllByRole('listitem')).toHaveLength(12);
});
test('legacy sets without a court show an explicit unavailable message', async () => {
  renderBoard(); await loaded();
  expect(screen.getByText('Raspored nije dostupan')).toBeTruthy();
  expect(screen.queryByText(/^Na servisu:/)).toBeNull();
});
