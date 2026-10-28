import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPlayer, type MatchRoster, type Player, type Team } from '../../src/api/client';
import { MatchRosterPage } from '../../src/matches/MatchRosterPage';
import { MatchesPage } from '../../src/matches/MatchesPage';
import { theme } from '../../src/theme';

const home: Team = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-01T12:00:00Z' };
const away: Team = { ...home, id: 'away', name: 'Partizan', city: 'Beograd' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'SCHEDULED',
  scheduledAt: '2026-10-15T16:30:00Z', createdAt: home.createdAt };
const marko: Player = { id: 'marko', teamId: home.id, firstName: 'Marko', lastName: 'Marković',
  jerseyNumber: 7, position: 'SETTER', createdAt: home.createdAt };
const petar: Player = { ...marko, id: 'petar', teamId: away.id, firstName: 'Petar', lastName: 'Petrović', position: 'LIBERO' };
const roster: MatchRoster = { match, version: 0,
  home: { team: home, selected: [], available: [marko] },
  away: { team: away, selected: [], available: [petar] } };
function savedPlayer(player: Player, isLibero = false): MatchPlayer {
  return { ...player, id: 'entry-' + player.id, playerId: player.id, isLibero };
}
function renderPage(canManage = true, onBack = vi.fn()) {
  render(<MantineProvider theme={theme} env="test">
    <MatchRosterPage matchId={match.id} canManage={canManage} onBack={onBack} />
  </MantineProvider>);
  return onBack;
}
async function loaded() { await screen.findByRole('form', { name: 'Sastavi utakmice' }); }
function choose(name = '#7 Marko Marković') { fireEvent.click(screen.getByRole('checkbox', { name })); }
function save() { fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj sastave' })); }
function unloadWouldWarn() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
beforeEach(() => {
  vi.spyOn(api, 'matchRoster').mockResolvedValue(roster);
  vi.spyOn(notifications, 'show').mockReturnValue('notice');
});
afterEach(() => vi.restoreAllMocks());

test('statistician selects both sides, auto-designates primary libero and saves IDs only', async () => {
  const result = { ...roster, version: 1, home: { ...roster.home, selected: [savedPlayer(marko)] },
    away: { ...roster.away, selected: [savedPlayer(petar, true)] } };
  const write = vi.spyOn(api, 'saveMatchRoster').mockResolvedValue(result);
  renderPage();
  await loaded();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Sastavi utakmice' }));
  expect((screen.getByRole('checkbox', { name: 'Libero za Marko Marković' }) as HTMLInputElement).disabled).toBe(true);
  choose();
  choose('#7 Petar Petrović');
  expect((screen.getByRole('checkbox', { name: 'Libero za Petar Petrović' }) as HTMLInputElement).checked).toBe(true);
  save();
  await waitFor(() => expect(write).toHaveBeenCalledExactlyOnceWith(match.id, {
    version: 0, homePlayers: [{ playerId: 'marko', isLibero: false }],
    awayPlayers: [{ playerId: 'petar', isLibero: true }],
  }));
  await screen.findByText('Prikazan je sačuvani sastav.');
  expect(notifications.show).toHaveBeenCalledTimes(1);
  save();
  await waitFor(() => expect(write).toHaveBeenLastCalledWith(match.id, expect.objectContaining({ version: 1 })));
});
test('removing a player removes its libero flag and permits saving an empty draft', async () => {
  vi.mocked(api.matchRoster).mockResolvedValue({ ...roster,
    home: { ...roster.home, selected: [savedPlayer(marko, true)] } });
  const write = vi.spyOn(api, 'saveMatchRoster').mockResolvedValue({ ...roster, version: 1 });
  renderPage();
  await loaded();
  choose();
  expect((screen.getByRole('checkbox', { name: 'Libero za Marko Marković' }) as HTMLInputElement).checked).toBe(false);
  save();
  await waitFor(() => expect(write).toHaveBeenCalledWith(match.id, { version: 0, homePlayers: [], awayPlayers: [] }));
});
test('coach sees saved snapshot data only, with no editable controls', async () => {
  vi.mocked(api.matchRoster).mockResolvedValue({ ...roster,
    home: { ...roster.home, available: [{ ...marko, firstName: 'Promenjeno', jerseyNumber: 99 }],
      selected: [savedPlayer(marko, true)] } });
  renderPage(false);
  await loaded();
  expect(screen.getByText('#7 Marko Marković')).toBeTruthy();
  expect(screen.getByText('Libero')).toBeTruthy();
  expect(screen.queryByText(/Promenjeno/)).toBeNull();
  expect(screen.queryByText(/Petar Petrović/)).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sačuvaj sastave' })).toBeNull();
});
for (const status of ['LIVE', 'FINISHED'] as const) {
  test('statistician can only view ' + status + ' rosters', async () => {
    vi.mocked(api.matchRoster).mockResolvedValue({ ...roster, match: { ...match, status },
      home: { ...roster.home, selected: [savedPlayer(marko)] } });
    renderPage();
    await loaded();
    expect(screen.getByText('#7 Marko Marković')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sačuvaj sastave' })).toBeNull();
  });
}
test('load failure supports retry and does not render a save form', async () => {
  vi.mocked(api.matchRoster).mockRejectedValueOnce(new ApiError('Utakmica nije dostupna.', 404));
  renderPage();
  await screen.findByText('Utakmica nije dostupna.');
  expect(screen.queryByRole('form')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }));
  await loaded();
  expect(api.matchRoster).toHaveBeenCalledTimes(2);
});
test('failed stale save retains the draft; reloading asks before discarding it', async () => {
  const write = vi.spyOn(api, 'saveMatchRoster').mockRejectedValue(new ApiError('Sastav je u međuvremenu promenjen.', 409));
  renderPage();
  await loaded();
  choose();
  save();
  await screen.findByText('Sastav je u međuvremenu promenjen.');
  expect((screen.getByRole('checkbox', { name: '#7 Marko Marković' }) as HTMLInputElement).checked).toBe(true);
  expect(api.matchRoster).toHaveBeenCalledTimes(1);
  vi.mocked(api.matchRoster).mockResolvedValue({ ...roster, version: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Učitaj sačuvani sastav' }));
  expect(screen.getByText('Nesačuvane izmene')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Odbaci izmene' }));
  await waitFor(() => expect(api.matchRoster).toHaveBeenCalledTimes(2));
  await loaded();
  expect((screen.getByRole('checkbox', { name: '#7 Marko Marković' }) as HTMLInputElement).checked).toBe(false);
  expect(screen.queryByText('Sastav je u međuvremenu promenjen.')).toBeNull();
  expect(write).toHaveBeenCalledTimes(1);
});
test('back navigation protects unsaved changes without a modal', async () => {
  const back = renderPage();
  await loaded();
  choose();
  fireEvent.click(screen.getByRole('button', { name: 'Nazad na utakmice' }));
  expect(back).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Nastavi uređivanje' }));
  expect(screen.queryByText('Nesačuvane izmene')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Nazad na utakmice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Odbaci izmene' }));
  expect(back).toHaveBeenCalledTimes(1);
});

test('browser unload is guarded for dirty and saving rosters, then released after save or discard', async () => {
  const saved: MatchRoster = { ...roster, version: 1, home: { ...roster.home, selected: [savedPlayer(marko)] } };
  let resolve!: (result: MatchRoster) => void;
  const write = vi.spyOn(api, 'saveMatchRoster').mockReturnValue(new Promise(done => { resolve = done; }));
  renderPage(); await loaded();
  expect(unloadWouldWarn()).toBe(false);
  choose(); expect(unloadWouldWarn()).toBe(true);
  save(); await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(unloadWouldWarn()).toBe(true);
  await act(async () => resolve(saved));
  await screen.findByText('Prikazan je sačuvani sastav.');
  expect(unloadWouldWarn()).toBe(false);
  choose(); expect(unloadWouldWarn()).toBe(true);
  vi.mocked(api.matchRoster).mockResolvedValue(saved);
  fireEvent.click(screen.getByRole('button', { name: 'Učitaj sačuvani sastav' }));
  fireEvent.click(screen.getByRole('button', { name: 'Odbaci izmene' }));
  await loaded(); expect(unloadWouldWarn()).toBe(false);
});

test('read-only roster review never blocks browser unload', async () => {
  renderPage(false); await loaded();
  expect(unloadWouldWarn()).toBe(false);
});
test('third libero is rejected before API write', async () => {
  const players: Player[] = [1, 2, 3].map((n) => ({ ...marko, id: 'p' + n, firstName: 'Igrač' + n, jerseyNumber: n, position: 'LIBERO' }));
  vi.mocked(api.matchRoster).mockResolvedValue({ ...roster, home: { ...roster.home, available: players } });
  const write = vi.spyOn(api, 'saveMatchRoster');
  renderPage();
  await loaded();
  for (const p of players) choose('#' + p.jerseyNumber + ' ' + p.firstName + ' ' + p.lastName);
  save();
  expect(screen.getByText('U jednom timu možete označiti najviše dva libera.')).toBeTruthy();
  expect(write).not.toHaveBeenCalled();
});
test('pending save disables editing and duplicate submission', async () => {
  let resolve!: (data: MatchRoster) => void;
  const write = vi.spyOn(api, 'saveMatchRoster').mockReturnValue(new Promise((done) => { resolve = done; }));
  renderPage();
  await loaded();
  choose();
  save();
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect((screen.getByRole('checkbox', { name: '#7 Marko Marković' }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Nazad na utakmice' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(screen.getByRole('form'));
  expect(write).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ...roster, version: 1, home: { ...roster.home, selected: [savedPlayer(marko)] } }));
  await screen.findByText('Prikazan je sačuvani sastav.');
});
test('empty clubs provide guidance rather than blank player selectors', async () => {
  vi.mocked(api.matchRoster).mockResolvedValue({ ...roster, home: { ...roster.home, available: [] } });
  renderPage();
  await loaded();
  expect(screen.getByText('Tim nema igrače. Najpre ih dodajte u sekciji Timovi i igrači.')).toBeTruthy();
});
test('matches list opens roster and refreshes after returning', async () => {
  vi.spyOn(api, 'matches').mockResolvedValue({ content: [match], page: 0, totalPages: 1, totalElements: 1 });
  render(<MantineProvider theme={theme} env="test"><MatchesPage canManage={false} /></MantineProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Prikaži sastave' }));
  await loaded();
  expect(api.matchRoster).toHaveBeenCalledWith(match.id, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: 'Nazad na utakmice' }));
  await screen.findByRole('article');
  expect(api.matches).toHaveBeenCalledTimes(2);
});
