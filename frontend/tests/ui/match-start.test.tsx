import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPlayer, type MatchPreparation, type MatchSet, type Team } from '../../src/api/client';
import { MatchPreparationPage } from '../../src/matches/MatchPreparationPage';
import { MatchesPage } from '../../src/matches/MatchesPage';
import { theme } from '../../src/theme';

const home: Team = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-01T12:00:00Z' };
const away: Team = { ...home, id: 'away', name: 'Partizan' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'SCHEDULED',
  scheduledAt: '2026-10-15T16:00:00Z', createdAt: home.createdAt };
function players(team: Team): MatchPlayer[] {
  return ['Marko', 'Nikola', 'Petar', 'Luka', 'Aleksa', 'Filip', 'Miloš'].map((firstName, index) => ({
    id: team.id + '-entry-' + index, playerId: team.id + '-player-' + index, teamId: team.id,
    firstName, lastName: 'Marković', jerseyNumber: index + 1, position: index === 6 ? 'LIBERO' : 'SETTER',
    isLibero: index === 6,
  }));
}
const homePlayers = players(home), awayPlayers = players(away);
const preparation: MatchPreparation = { roster: { match, version: 2,
  home: { team: home, selected: homePlayers, available: [] },
  away: { team: away, selected: awayPlayers, available: [] } }, firstSet: null };
const firstSet: MatchSet = { id: 'set', number: 1, status: 'LIVE', homeScore: 0, awayScore: 0,
  firstServingTeamId: home.id, startedAt: '2026-10-14T12:00:00Z',
  homeLineup: homePlayers.slice(0, 6).map((participant, index) => ({ participant, rotationPosition: index + 1 })),
  awayLineup: awayPlayers.slice(0, 6).map((participant, index) => ({ participant, rotationPosition: index + 1 })) };
const started: MatchPreparation = { ...preparation, roster: { ...preparation.roster, match: { ...match, status: 'LIVE' } }, firstSet };
beforeEach(() => {
  vi.spyOn(api, 'matchPreparation').mockResolvedValue(preparation);
  vi.spyOn(api, 'setScore').mockResolvedValue({ setId: firstSet.id, version: 0, homeScore: 0, awayScore: 0,
    matchStatus: 'LIVE', setStatus: 'LIVE', canRecord: true, lastActivePoint: null, points: [] });
  vi.spyOn(notifications, 'show').mockReturnValue('notice');
});
afterEach(() => vi.restoreAllMocks());
function renderPage(canManage = true, onBack = vi.fn()) {
  render(<MantineProvider theme={theme} env="test">
    <MatchPreparationPage matchId={match.id} canManage={canManage} onBack={onBack} />
  </MantineProvider>);
  return onBack;
}
async function loaded() { await screen.findByRole('form', { name: 'Priprema prvog seta' }); }
async function chooseSlot(team: Team, index: number) {
  fireEvent.click(screen.getByRole('combobox', { name: team.name + ' · pozicija ' + (index + 1) }));
  fireEvent.click(await screen.findByRole('option', {
    name: '#' + (index + 1) + ' ' + homePlayers[index].firstName + ' Marković · Tehničar',
  }));
}
async function fill() {
  for (const team of [home, away]) for (let index = 0; index < 6; index++) await chooseSlot(team, index);
  fireEvent.click(screen.getByRole('combobox', { name: /^Tim koji prvi servira/ }));
  fireEvent.click(await screen.findByRole('option', { name: home.name }));
}
test('statistician confirms before starting, then sees saved sixes and 0:0', async () => {
  const write = vi.spyOn(api, 'startMatch').mockResolvedValue(started);
  renderPage(); await loaded();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Početne postave' }));
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Počni utakmicu' }));
  expect(write).not.toHaveBeenCalled();
  expect(screen.getByText('Pokretanje utakmice')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi početak' }));
  await waitFor(() => expect(write).toHaveBeenCalledExactlyOnceWith(match.id, {
    rosterVersion: 2, homeLineup: homePlayers.slice(0, 6).map((p) => p.id),
    awayLineup: awayPlayers.slice(0, 6).map((p) => p.id), firstServingTeamId: home.id,
  }));
  await screen.findByText('Vojvodina 0 : 0 Partizan');
  expect(screen.getByRole('region', { name: 'Rezultat prvog seta' })).toBeTruthy();
  expect(screen.queryByRole('form')).toBeNull();
  expect(notifications.show).toHaveBeenCalledTimes(1);
}, 20_000);
test('registered liberos are excluded and another occupied slot cannot reuse a player', async () => {
  renderPage(); await loaded();
  await chooseSlot(home, 0);
  fireEvent.click(screen.getByRole('combobox', { name: home.name + ' · pozicija 2' }));
  const used = await screen.findByRole('option', { name: '#1 Marko Marković · Tehničar' });
  expect(used.getAttribute('data-combobox-disabled')).not.toBeNull();
  expect(screen.queryByRole('option', { name: /Miloš/ })).toBeNull();
});
test('missing positions show validation without asking to start', async () => {
  const write = vi.spyOn(api, 'startMatch');
  renderPage(); await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Počni utakmicu' }));
  expect(screen.getAllByText('Izaberite igrača za svih šest pozicija.')).toHaveLength(2);
  expect(screen.getByText('Izaberite tim koji prvi servira.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Potvrdi početak' })).toBeNull();
  expect(write).not.toHaveBeenCalled();
});
test('too few eligible participants explain why start is disabled', async () => {
  vi.mocked(api.matchPreparation).mockResolvedValue({ ...preparation, roster: { ...preparation.roster,
    home: { ...preparation.roster.home, selected: homePlayers.slice(0, 5) } } });
  renderPage(); await loaded();
  expect(screen.getByText(/Potrebno je najmanje šest prijavljenih/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Počni utakmicu' }) as HTMLButtonElement).disabled).toBe(true);
});
test('coach sees scheduled preparation as read-only', async () => {
  renderPage(false);
  await screen.findByText('Početne postave još nisu sačuvane. Statističar ih bira pri pokretanju utakmice.');
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Počni utakmicu' })).toBeNull();
});
for (const canManage of [true, false]) {
  test('started match shows immutable initial lineups for ' + (canManage ? 'statistician' : 'coach'), async () => {
    vi.mocked(api.matchPreparation).mockResolvedValue(started);
    renderPage(canManage);
    await screen.findByText('Vojvodina 0 : 0 Partizan');
    expect(screen.getAllByText('#1 Marko Marković')).toHaveLength(2);
    expect(screen.getByText('Prvi servis: Vojvodina')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Počni utakmicu' })).toBeNull();
  });
}
test('failed start preserves selections and supports explicit reload with discard confirmation', async () => {
  const write = vi.spyOn(api, 'startMatch').mockRejectedValue(new ApiError('Sastav je promenjen.', 409));
  renderPage(); await loaded(); await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Počni utakmicu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi početak' }));
  await screen.findByText('Sastav je promenjen.');
  expect((screen.getByRole('combobox', { name: home.name + ' · pozicija 1' }) as HTMLInputElement).value).toMatch(/Marko/);
  expect(write).toHaveBeenCalledTimes(1);
  vi.mocked(api.matchPreparation).mockResolvedValue(started);
  fireEvent.click(screen.getByRole('button', { name: 'Učitaj trenutno stanje' }));
  expect(screen.getByText('Nesačuvane postave')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Odbaci izmene' }));
  await screen.findByText('Vojvodina 0 : 0 Partizan');
  expect(screen.queryByText('Sastav je promenjen.')).toBeNull();
}, 20_000);
test('back navigation protects partial selections', async () => {
  const back = renderPage(); await loaded(); await chooseSlot(home, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Nazad na utakmice' }));
  expect(back).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Nastavi uređivanje' }));
  expect(screen.queryByText('Nesačuvane postave')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Nazad na utakmice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Odbaci izmene' }));
  expect(back).toHaveBeenCalledTimes(1);
});
test('pending start disables all inputs and duplicate confirmation', async () => {
  let resolve!: (data: MatchPreparation) => void;
  const write = vi.spyOn(api, 'startMatch').mockReturnValue(new Promise((done) => { resolve = done; }));
  renderPage(); await loaded(); await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Počni utakmicu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi početak' }));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect((screen.getByRole('button', { name: 'Nazad na utakmice' }) as HTMLButtonElement).disabled).toBe(true);
  for (const combo of screen.getAllByRole('combobox')) expect((combo as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi početak' }));
  expect(write).toHaveBeenCalledTimes(1);
  await act(async () => resolve(started));
  await screen.findByText('Vojvodina 0 : 0 Partizan');
}, 20_000);
test('load failure can be retried', async () => {
  vi.mocked(api.matchPreparation).mockRejectedValueOnce(new ApiError('Nije dostupno.', 503));
  renderPage(); await screen.findByText('Nije dostupno.');
  fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }));
  await loaded();
});
test('match card opens preparation and refreshes list on return', async () => {
  vi.spyOn(api, 'matches').mockResolvedValue({ content: [match], page: 0, totalPages: 1, totalElements: 1 });
  render(<MantineProvider theme={theme} env="test"><MatchesPage canManage /></MantineProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Početne postave' }));
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Nazad na utakmice' }));
  await screen.findByRole('article');
  expect(api.matches).toHaveBeenCalledTimes(2);
});
