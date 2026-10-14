import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchSet, type SetPoint, type SetScore, type Team } from '../../src/api/client';
import { MatchScoreboard } from '../../src/matches/MatchScoreboard';
import { theme } from '../../src/theme';

const home: Team = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-14T12:00:00Z' };
const away: Team = { ...home, id: 'away', name: 'Partizan' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'LIVE',
  scheduledAt: home.createdAt, createdAt: home.createdAt };
const set: MatchSet = { id: 'set', number: 1, status: 'LIVE', homeScore: 0, awayScore: 0,
  firstServingTeamId: home.id, startedAt: home.createdAt, homeLineup: [], awayLineup: [] };
const zero: SetScore = { setId: set.id, version: 0, homeScore: 0, awayScore: 0,
  matchStatus: 'LIVE', setStatus: 'LIVE', canRecord: true, lastActivePoint: null, points: [] };
const point: SetPoint = { id: 'point', sequenceNumber: 1, scoringTeamId: home.id,
  homeScoreAfter: 1, awayScoreAfter: 0, createdAt: home.createdAt, cancelledAt: null };
const one: SetScore = { ...zero, version: 1, homeScore: 1, lastActivePoint: point, points: [point] };
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
  vi.mocked(api.setScore).mockResolvedValue({ ...one, setStatus: 'FINISHED', canRecord: false });
  renderBoard(); await screen.findByText('Vojvodina 1 : 0 Partizan');
  expect(screen.getByText('Završen')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Poen za domaćina' })).toBeNull();
  expect(screen.getByText('Unos nije dostupan jer utakmica ili set nisu u toku.')).toBeTruthy();
});
