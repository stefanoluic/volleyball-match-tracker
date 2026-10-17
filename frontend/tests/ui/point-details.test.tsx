import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPlayer, type MatchSet, type SetScore, type Team } from '../../src/api/client';
import { MatchScoreboard } from '../../src/matches/MatchScoreboard';
import { theme } from '../../src/theme';

const home: Team = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-16T12:00:00Z' };
const away: Team = { ...home, id: 'away', name: 'Partizan' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'LIVE', scheduledAt: home.createdAt, createdAt: home.createdAt };
function player(team: Team, n: number): MatchPlayer {
  return { id: team.id + n, playerId: team.id + '-player' + n, teamId: team.id, firstName: team.id === 'home' ? 'Marko' : 'Petar',
    lastName: 'Marković', jerseyNumber: n, position: 'SETTER', isLibero: n === 8 };
}
const hp = Array.from({ length: 8 }, (_, i) => player(home, i + 1));
const ap = Array.from({ length: 8 }, (_, i) => player(away, i + 1));
const set: MatchSet = { id: 'set', number: 1, status: 'LIVE', homeScore: 0, awayScore: 0, firstServingTeamId: home.id,
  startedAt: home.createdAt, homeLineup: hp.slice(0,6).map((participant,i) => ({ participant, rotationPosition: i+1 })),
  awayLineup: ap.slice(0,6).map((participant,i) => ({ participant, rotationPosition: i+1 })), scoreVersion: 0, finishedAt: null, winnerTeamId: null };
const zero: SetScore = { setId: set.id, version: 0, homeScore: 0, awayScore: 0, matchStatus: 'LIVE', setStatus: 'LIVE',
  canRecord: true, lastActivePoint: null, points: [], canUndo: false, canFinish: false, winnerTeamId: null,
  court: { servingTeamId: home.id, server: hp[0], homeLineup: set.homeLineup, awayLineup: set.awayLineup }, libero: null,
  substitutions: { homeUsed: 0, awayUsed: 0, options: [], history: [], undoableId: null, pointUndoBlocked: false } };
const point = { id: 'point', sequenceNumber: 1, scoringTeamId: home.id, homeScoreAfter: 1, awayScoreAfter: 0,
  createdAt: home.createdAt, cancelledAt: null, actionType: 'ATTACK' as const, participant: hp[2] };
const one: SetScore = { ...zero, version: 1, homeScore: 1, points: [point], lastActivePoint: point, canUndo: true };
beforeEach(() => {
  vi.spyOn(api, 'setScore').mockResolvedValue(zero);
  vi.spyOn(notifications, 'show').mockReturnValue('notice');
});
afterEach(() => vi.restoreAllMocks());
function renderBoard(canManage = true) {
  const guard = vi.fn();
  render(<MantineProvider theme={theme} env="test"><MatchScoreboard match={match} set={set} canManage={canManage} onBusyChange={guard} /></MantineProvider>);
  return guard;
}
async function enabled(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  return button;
}
async function open() { fireEvent.click(await enabled('Detaljan unos poena')); }
async function choose(label: RegExp | string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}
async function attack() {
  await open(); await choose(/^Igrač koji osvaja poen/, '#3 Marko Marković');
  fireEvent.click(screen.getByRole('button', { name: 'Pregledaj poen' }));
}

test('detail form is inline, validates actor and requires confirmation before a single point write', async () => {
  const write = vi.spyOn(api, 'addPoint').mockResolvedValue(one);
  const guard = renderBoard(); await open();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect((screen.getByRole('button', { name: 'Poen za gosta' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Osveži rezultat' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Unesi izmenu' }) as HTMLButtonElement).disabled).toBe(true);
  expect(guard).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Pregledaj poen' }));
  expect(await screen.findByText('Izaberite igrača za ovu akciju.')).toBeTruthy();
  expect(write).not.toHaveBeenCalled();
  await choose(/^Igrač koji osvaja poen/, '#3 Marko Marković');
  fireEvent.click(screen.getByRole('button', { name: 'Pregledaj poen' }));
  expect(write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi poen' }));
  await screen.findByText('Vojvodina 1 : 0 Partizan');
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Detalji novog poena' })).toBeNull());
  expect(write).toHaveBeenCalledExactlyOnceWith(match.id, set.id, {
    version: 0, requestId: expect.any(String), scoringTeamId: home.id, actionType: 'ATTACK', participantId: hp[2].id,
  });
  expect(screen.getByText('Poen napadom · #3 Marko Marković')).toBeTruthy();
  await waitFor(() => expect(guard).toHaveBeenLastCalledWith(false));
});
test('error selection lists opposing six only and may remain unattributed', async () => {
  const write = vi.spyOn(api, 'addPoint').mockResolvedValue({ ...one, points: [{ ...point, actionType: 'OPPONENT_ERROR', participant: null }] });
  renderBoard(); await open(); await choose('Način osvajanja poena', 'Greška protivnika');
  fireEvent.click(screen.getByRole('combobox', { name: 'Igrač protivnika koji je pogrešio' }));
  expect(await screen.findByRole('option', { name: '#1 Petar Marković' })).toBeTruthy();
  expect(screen.queryByRole('option', { name: '#1 Marko Marković' })).toBeNull();
  expect(screen.queryByRole('option', { name: '#7 Petar Marković' })).toBeNull();
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Igrač protivnika koji je pogrešio' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Pregledaj poen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi poen' }));
  await waitFor(() => expect(write).toHaveBeenCalledWith(match.id, set.id, expect.objectContaining({
    actionType: 'OPPONENT_ERROR', scoringTeamId: home.id, participantId: null,
  })));
});
test('opponent individual error is shown as an error, not a point credited to that player', async () => {
  const errorPoint = { ...point, actionType: 'OPPONENT_ERROR' as const, participant: ap[1] };
  vi.mocked(api.setScore).mockResolvedValue({ ...one, points: [errorPoint], lastActivePoint: errorPoint });
  renderBoard(false);
  expect(await screen.findByText('Greška protivnika · Greška: #2 Petar Marković')).toBeTruthy();
});
test('ace automatically selects actual server, including a substituted server', async () => {
  vi.mocked(api.setScore).mockResolvedValue({ ...zero, court: { ...zero.court!, server: hp[6],
    homeLineup: zero.court!.homeLineup.map(row => row.rotationPosition === 1 ? { ...row, participant: hp[6] } : row) } });
  const write = vi.spyOn(api, 'addPoint').mockResolvedValue(one);
  renderBoard(); await open(); await choose('Način osvajanja poena', 'Servis-as');
  expect(await screen.findByText('Servis-as će biti pripisan serveru: #7 Marko Marković.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Pregledaj poen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi poen' }));
  await waitFor(() => expect(write).toHaveBeenCalledWith(match.id, set.id, expect.objectContaining({ actionType: 'SERVICE_ACE', participantId: hp[6].id })));
});
test('receiving team cannot be assigned an ace and changing team clears prior actor selection', async () => {
  const write = vi.spyOn(api, 'addPoint');
  renderBoard(); await open(); await choose(/^Igrač koji osvaja poen/, '#3 Marko Marković');
  await choose('Tim koji osvaja poen', 'Partizan');
  expect((screen.getByRole('combobox', { name: /^Igrač koji osvaja poen/ }) as HTMLInputElement).value).toBe('');
  await choose('Način osvajanja poena', 'Servis-as');
  fireEvent.click(screen.getByRole('button', { name: 'Pregledaj poen' }));
  expect(screen.queryByRole('button', { name: 'Potvrdi poen' })).toBeNull();
  expect(write).not.toHaveBeenCalled();
});
test('block selection offers only three front-row players and no bench', async () => {
  renderBoard(); await open(); await choose('Način osvajanja poena', 'Poen blokom');
  fireEvent.click(screen.getByRole('combobox', { name: /^Igrač koji osvaja poen/ }));
  const list = await screen.findByRole('listbox');
  expect(within(list).getAllByRole('option').map(row => row.textContent)).toEqual(['#2 Marko Marković', '#3 Marko Marković', '#4 Marko Marković']);
});
test('uncertain detailed write retries unchanged details and cannot submit a second command', async () => {
  const write = vi.spyOn(api, 'addPoint').mockRejectedValueOnce(new Error('lost response')).mockResolvedValue(one);
  renderBoard(); await attack(); fireEvent.click(screen.getByRole('button', { name: 'Potvrdi poen' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ponovi isti zahtev' }));
  await screen.findByText('Vojvodina 1 : 0 Partizan');
  expect(write).toHaveBeenCalledTimes(2); expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
});
test('stale detailed draft is preserved and must be cancelled before refresh', async () => {
  vi.spyOn(api, 'addPoint').mockRejectedValue(new ApiError('Stanje je promenjeno.', 409));
  const guard = renderBoard(); await attack(); fireEvent.click(screen.getByRole('button', { name: 'Potvrdi poen' }));
  await screen.findByText('Stanje je promenjeno.');
  expect((screen.getByRole('combobox', { name: /^Igrač koji osvaja poen/ }) as HTMLInputElement).value).toBe('#3 Marko Marković');
  expect((screen.getByRole('button', { name: 'Osveži rezultat' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Ponovi isti zahtev' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Odustani od poena' }));
  fireEvent.click(await enabled('Osveži rezultat'));
  await waitFor(() => expect(screen.queryByText('Stanje je promenjeno.')).toBeNull());
  await waitFor(() => expect(guard).toHaveBeenLastCalledWith(false));
});
test('in-flight write disables cancellation and rapid confirm clicks make a single request', async () => {
  let resolve!: (result: SetScore) => void;
  const write = vi.spyOn(api, 'addPoint').mockReturnValue(new Promise(done => { resolve = done; }));
  renderBoard(); await attack();
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi poen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi poen' }));
  expect((screen.getByRole('button', { name: 'Odustani od poena' }) as HTMLButtonElement).disabled).toBe(true);
  expect(write).toHaveBeenCalledTimes(1);
  await act(async () => resolve(one));
});
test('coach and finished sets never expose a detailed point editor', async () => {
  renderBoard(false); await screen.findByText('Vojvodina 0 : 0 Partizan');
  expect(screen.queryByRole('button', { name: 'Detaljan unos poena' })).toBeNull();
});
test('unavailable court disables detailed entry while retaining quick score-only entry', async () => {
  vi.mocked(api.setScore).mockResolvedValue({ ...zero, court: null });
  renderBoard(); await screen.findByText('Vojvodina 0 : 0 Partizan');
  expect((screen.getByRole('button', { name: 'Detaljan unos poena' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Poen za domaćina' }) as HTMLButtonElement).disabled).toBe(false);
});
test('cancelled points retain their details in history but do not affect score', async () => {
  vi.mocked(api.setScore).mockResolvedValue({ ...zero, version: 2, points: [{ ...point, cancelledAt: home.createdAt }] });
  renderBoard();
  expect(await screen.findByText('Poen napadom · #3 Marko Marković')).toBeTruthy();
  expect(screen.getByText('Poništen')).toBeTruthy();
  expect(screen.getByText('Vojvodina 0 : 0 Partizan')).toBeTruthy();
});
