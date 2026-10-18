import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPreparation, type MatchSet, type MatchStatistics, type SetScore } from '../../src/api/client';
import { MatchPreparationPage } from '../../src/matches/MatchPreparationPage';
import { MatchScoreboard } from '../../src/matches/MatchScoreboard';
import { MatchStatisticsPanel } from '../../src/matches/MatchStatisticsPanel';
import { theme } from '../../src/theme';

const home = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-17T12:00:00Z' };
const away = { ...home, id: 'away', name: 'Partizan' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'LIVE', scheduledAt: home.createdAt, createdAt: home.createdAt };
const first: MatchSet = { id: 'set1', number: 1, status: 'LIVE', homeScore: 0, awayScore: 0, firstServingTeamId: home.id,
  startedAt: home.createdAt, homeLineup: [], awayLineup: [], scoreVersion: 0, finishedAt: null, winnerTeamId: null };
const zero: SetScore = { setId: first.id, version: 0, homeScore: 0, awayScore: 0, matchStatus: 'LIVE', setStatus: 'LIVE', canRecord: true,
  lastActivePoint: null, points: [], canUndo: false, canFinish: false, winnerTeamId: null, court: null, substitutions: null, libero: null };
const preparation: MatchPreparation = { roster: { match, version: 0, home: { team: home, selected: [], available: [] },
  away: { team: away, selected: [], available: [] } }, firstSet: first, sets: [first], currentSet: first,
  nextSetNumber: null, homeSetsWon: 0, awaySetsWon: 0 };
const emptyTeam = { totalPoints: 0, attackPoints: 0, blockPoints: 0, serviceAces: 0, opponentErrors: 0, unspecifiedPoints: 0,
  errors: 0, unattributedErrors: 0, players: [] };
const statistics: MatchStatistics = { matchId: match.id, setId: null, matchStatus: 'LIVE',
  analysis: { availability: 'INSUFFICIENT_DATA', totalRallies: 0, unspecifiedRallies: 0, minimumRallies: 10, minimumDetailCoveragePercent: 80, teams: [] },
  sets: [{ id: first.id, number: 1, status: 'LIVE', scoreVersion: 0 }],
  home: { ...emptyTeam, teamId: home.id, name: home.name }, away: { ...emptyTeam, teamId: away.id, name: away.name } };
const advance = async (ms = 3000) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const wrap = (child: React.ReactNode) => <MantineProvider theme={theme} env="test">{child}</MantineProvider>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(api, 'setScore').mockResolvedValue(zero);
  vi.spyOn(api, 'matchPreparation').mockResolvedValue(preparation);
  vi.spyOn(api, 'matchStatistics').mockResolvedValue(statistics);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function board(canManage = false) {
  await act(async () => { render(wrap(<MatchScoreboard match={match} set={first} canManage={canManage} onBusyChange={() => {}} />)); });
}

test('coach sees another user point and undo automatically without write requests or a loading flash', async () => {
  const write = vi.spyOn(api, 'addPoint');
  await board();
  vi.mocked(api.setScore).mockResolvedValue({ ...zero, version: 1, homeScore: 1 });
  await advance(); expect(screen.getByText('Vojvodina 1 : 0 Partizan')).toBeTruthy();
  expect(screen.queryByLabelText('Učitavanje rezultata')).toBeNull();
  vi.mocked(api.setScore).mockResolvedValue({ ...zero, version: 2 });
  await advance(); expect(screen.getByText('Vojvodina 0 : 0 Partizan')).toBeTruthy();
  expect(write).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Poen za domaćina' })).toBeNull();
});
test('statistician never polls over his scoring workflow', async () => {
  await board(true); await advance(30000); expect(api.setScore).toHaveBeenCalledTimes(1);
});
test('temporary score failure marks retained data stale and then recovers automatically', async () => {
  await board(); vi.mocked(api.setScore).mockRejectedValueOnce(new ApiError('Server nije dostupan.', 503));
  await advance(); expect(screen.getByText(/Podaci mogu biti zastareli/)).toBeTruthy();
  expect(screen.getByText('Vojvodina 0 : 0 Partizan')).toBeTruthy();
  vi.mocked(api.setScore).mockResolvedValue({ ...zero, version: 1, awayScore: 1 });
  await advance(6000); expect(screen.getByText('Vojvodina 0 : 1 Partizan')).toBeTruthy();
  expect(screen.queryByText(/Podaci mogu biti zastareli/)).toBeNull();
});
test('initial score load failure can recover without pressing refresh', async () => {
  vi.mocked(api.setScore).mockRejectedValueOnce(new Error('Lost connection'));
  await board(); expect(screen.getByText('Veza sa serverom nije dostupna. Proverite da li je backend pokrenut.')).toBeTruthy();
  await advance(); expect(screen.getByText('Vojvodina 0 : 0 Partizan')).toBeTruthy();
  expect(screen.queryByText('Veza sa serverom nije dostupna. Proverite da li je backend pokrenut.')).toBeNull();
});
test('manual refresh aborts a pending automatic score read so its late response cannot overwrite newer data', async () => {
  let resolve!: (value: SetScore) => void;
  await board(); vi.mocked(api.setScore).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await advance(); const signal = vi.mocked(api.setScore).mock.calls[1][2]!;
  vi.mocked(api.setScore).mockResolvedValue({ ...zero, version: 2, homeScore: 2 });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Osveži rezultat' })));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ...zero, version: 1, homeScore: 1 }));
  expect(screen.getByText('Vojvodina 2 : 0 Partizan')).toBeTruthy();
});
test('coach follows scheduled start, a new set and match completion automatically', async () => {
  let current: MatchPreparation = { ...preparation, roster: { ...preparation.roster, match: { ...match, status: 'SCHEDULED' } },
    sets: [], firstSet: null, currentSet: null };
  vi.mocked(api.matchPreparation).mockImplementation(async () => current);
  vi.mocked(api.setScore).mockImplementation(async (_match, id) => {
    const entry = current.sets.find(set => set.id === id)!;
    return { ...zero, setId: id, version: entry.scoreVersion, setStatus: entry.status, matchStatus: current.roster.match.status,
      homeScore: entry.homeScore, awayScore: entry.awayScore, canRecord: entry.status === 'LIVE' };
  });
  await act(async () => { render(wrap(<MatchPreparationPage matchId={match.id} canManage={false} onBack={() => {}} />)); });
  expect(screen.queryByText('Rezultat u setovima')).toBeNull();
  current = preparation; await advance(); expect(screen.getByText('Rezultat u setovima')).toBeTruthy();
  const ended = { ...first, status: 'FINISHED' as const, homeScore: 25, scoreVersion: 26, winnerTeamId: home.id };
  const second = { ...first, id: 'set2', number: 2 };
  current = { ...preparation, sets: [ended, second], firstSet: ended, currentSet: second, homeSetsWon: 1 };
  await advance(); expect((screen.getByRole('combobox', { name: 'Set za pregled' }) as HTMLInputElement).value).toContain('Set 2');
  current = { ...current, roster: { ...current.roster, match: { ...match, status: 'FINISHED' } },
    sets: [ended, { ...second, status: 'FINISHED', homeScore: 25, scoreVersion: 26 },
      { ...ended, id: 'set3', number: 3 }], currentSet: null, homeSetsWon: 3 };
  await advance(); expect(screen.getByText(/Utakmica je završena. Pobednik:/)).toBeTruthy();
  const reads = vi.mocked(api.matchPreparation).mock.calls.length;
  await advance(30000); expect(api.matchPreparation).toHaveBeenCalledTimes(reads);
});
test('reviewing a historical set does not jump to the active set on background refresh', async () => {
  const ended = { ...first, status: 'FINISHED' as const, homeScore: 25, scoreVersion: 26 };
  const second = { ...first, id: 'set2', number: 2 };
  vi.mocked(api.matchPreparation).mockResolvedValue({ ...preparation, sets: [ended, second], firstSet: ended, currentSet: second });
  vi.mocked(api.setScore).mockImplementation(async (_match, id) => ({ ...zero, setId: id, setStatus: id === 'set1' ? 'FINISHED' : 'LIVE' }));
  await act(async () => { render(wrap(<MatchPreparationPage matchId={match.id} canManage={false} onBack={() => {}} />)); });
  await act(async () => fireEvent.click(screen.getByRole('combobox', { name: 'Set za pregled' })));
  await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Set 1 · 25:0 · Završen' })));
  expect((screen.getByRole('checkbox', { name: 'Prati aktuelni set' }) as HTMLInputElement).checked).toBe(false);
  await advance(); expect((screen.getByRole('combobox', { name: 'Set za pregled' }) as HTMLInputElement).value).toContain('Set 1');
  await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: 'Prati aktuelni set' })));
  expect((screen.getByRole('combobox', { name: 'Set za pregled' }) as HTMLInputElement).value).toContain('Set 2');
});
test('expanded coach statistics poll independently; collapsed statistics and writer views do not', async () => {
  await act(async () => { render(wrap(<MatchStatisticsPanel match={match} revision="a" disabled={false} automatic />)); });
  await advance(10000); expect(api.matchStatistics).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prikaži statistiku' })));
  vi.mocked(api.matchStatistics).mockResolvedValue({ ...statistics, home: { ...statistics.home, totalPoints: 1, unspecifiedPoints: 1 } });
  await advance(); expect(screen.getByText('1 poen')).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sakrij statistiku' })));
  const count = vi.mocked(api.matchStatistics).mock.calls.length;
  await advance(30000); expect(api.matchStatistics).toHaveBeenCalledTimes(count);
});

test('match completion reloads whole-match statistics even when the coach keeps a historical set selected', async () => {
  const ended = { ...first, status: 'FINISHED' as const, homeScore: 25, scoreVersion: 26, winnerTeamId: home.id };
  const third = { ...first, id: 'set3', number: 3, homeScore: 24, scoreVersion: 24 };
  let current: MatchPreparation = { ...preparation, firstSet: ended,
    sets: [ended, { ...ended, id: 'set2', number: 2 }, third], currentSet: third, homeSetsWon: 2 };
  vi.mocked(api.matchPreparation).mockImplementation(async () => current);
  vi.mocked(api.setScore).mockImplementation(async (_match, id) => ({ ...zero, setId: id,
    version: 26, homeScore: 25, setStatus: 'FINISHED', canRecord: false }));
  vi.mocked(api.matchStatistics).mockResolvedValue({ ...statistics,
    home: { ...statistics.home, totalPoints: 74, unspecifiedPoints: 74 } });
  await act(async () => { render(wrap(<MatchPreparationPage matchId={match.id} canManage={false} onBack={() => {}} />)); });
  await act(async () => fireEvent.click(screen.getByRole('combobox', { name: 'Set za pregled' })));
  await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Set 1 · 25:0 · Završen' })));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prikaži statistiku' })));
  expect(screen.getByText('74 poena')).toBeTruthy();
  current = { ...current, roster: { ...current.roster, match: { ...match, status: 'FINISHED' } },
    sets: [...current.sets.slice(0, 2), { ...third, status: 'FINISHED', homeScore: 25, scoreVersion: 26 }],
    currentSet: null, homeSetsWon: 3 };
  vi.mocked(api.matchStatistics).mockResolvedValue({ ...statistics, matchStatus: 'FINISHED',
    home: { ...statistics.home, totalPoints: 75, unspecifiedPoints: 75 } });
  await advance();
  expect(screen.getByText('75 poena')).toBeTruthy();
  expect((screen.getByRole('combobox', { name: 'Set za pregled' }) as HTMLInputElement).value).toContain('Set 1');
  const reads = vi.mocked(api.matchStatistics).mock.calls.length;
  await advance(30000); expect(api.matchStatistics).toHaveBeenCalledTimes(reads);
});

test('final statistics supersede an in-flight live read and ignore its late response', async () => {
  const view = render(wrap(<MatchStatisticsPanel match={match} revision="historical:26" disabled={false} automatic />));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prikaži statistiku' })));
  let resolve!: (value: MatchStatistics) => void;
  vi.mocked(api.matchStatistics).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await advance();
  const signal = vi.mocked(api.matchStatistics).mock.calls[1][2]!;
  vi.mocked(api.matchStatistics).mockResolvedValue({ ...statistics, matchStatus: 'FINISHED',
    home: { ...statistics.home, totalPoints: 75, unspecifiedPoints: 75 } });
  await act(async () => view.rerender(wrap(<MatchStatisticsPanel match={{ ...match, status: 'FINISHED' }}
    revision="historical:26" disabled={false} automatic />)));
  expect(signal.aborted).toBe(true);
  expect(screen.getByText('75 poena')).toBeTruthy();
  await act(async () => resolve(statistics));
  expect(screen.getByText('75 poena')).toBeTruthy();
  expect(api.matchStatistics).toHaveBeenCalledTimes(3);
});

test('a failed final read hides old statistics and can be retried without restarting live polling', async () => {
  const view = render(wrap(<MatchStatisticsPanel match={match} revision="historical:26" disabled={false} automatic />));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prikaži statistiku' })));
  vi.mocked(api.matchStatistics).mockRejectedValueOnce(new ApiError('Konačna statistika nije dostupna.', 503));
  await act(async () => view.rerender(wrap(<MatchStatisticsPanel match={{ ...match, status: 'FINISHED' }}
    revision="historical:26" disabled={false} automatic />)));
  expect(screen.getByText('Konačna statistika nije dostupna.')).toBeTruthy();
  expect(screen.queryByRole('table', { name: 'Pregled timova' })).toBeNull();
  await advance(30000); expect(api.matchStatistics).toHaveBeenCalledTimes(2);
  vi.mocked(api.matchStatistics).mockResolvedValue({ ...statistics, matchStatus: 'FINISHED',
    home: { ...statistics.home, totalPoints: 75, unspecifiedPoints: 75 } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Osveži statistiku' })));
  expect(screen.getByText('75 poena')).toBeTruthy();
});
