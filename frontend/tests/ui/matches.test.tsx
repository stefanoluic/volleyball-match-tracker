import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type Team } from '../../src/api/client';
import { MatchesPage } from '../../src/matches/MatchesPage';
import { toLocalDateTime } from '../../src/matches/validation';
import { theme } from '../../src/theme';

const home: Team = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-01T12:00:00Z' };
const away: Team = { ...home, id: 'away', name: 'Partizan', city: 'Beograd' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'SCHEDULED',
  scheduledAt: '2026-10-15T16:30:00Z', createdAt: '2026-10-01T12:00:00Z' };
const populated = { content: [match], page: 0, totalPages: 1, totalElements: 1 };
const empty = { content: [], page: 0, totalPages: 0, totalElements: 0 };

beforeEach(() => {
  vi.spyOn(api, 'matches').mockResolvedValue(populated);
  vi.spyOn(api, 'teamOptions').mockResolvedValue([home, away]);
  vi.spyOn(notifications, 'show').mockReturnValue('notice');
});
afterEach(() => vi.restoreAllMocks());
function renderPage(canManage = true) {
  return render(<MantineProvider theme={theme} env="test"><MatchesPage canManage={canManage} /></MantineProvider>);
}
async function openCreate() {
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj utakmicu' }));
  await waitFor(() => expect(screen.queryByText('Učitavanje timova…')).toBeNull());
}
async function chooseTeams() {
  fireEvent.click(screen.getByRole('combobox', { name: /^Domaći tim/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Vojvodina · Novi Sad' }));
  fireEvent.click(screen.getByRole('combobox', { name: /^Gostujući tim/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Partizan · Beograd' }));
}
function setDate() {
  fireEvent.change(screen.getByLabelText(/^Datum i vreme/), { target: { value: '2026-10-15T18:30' } });
}

test('coach sees matches and status but no write controls', async () => {
  renderPage(false);
  const card = await screen.findByRole('article', { name: 'Vojvodina — Partizan' });
  expect(within(card).getByText('Zakazana')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Dodaj utakmicu' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Izmeni' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Obriši' })).toBeNull();
});
test('create uses existing teams and converts browser local time to UTC', async () => {
  const create = vi.spyOn(api, 'createMatch').mockResolvedValue(match);
  renderPage();
  await screen.findByRole('article');
  await openCreate();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Nova utakmica' }));
  expect(screen.getByText('Posle čuvanja prijavite sastave i izaberite početne postave. Utakmica počinje tek nakon potvrde statističara.')).toBeTruthy();
  expect(screen.queryByText(/Praćenje rezultata biće dodato kasnije/)).toBeNull();
  await chooseTeams();
  setDate();
  fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj utakmicu' }));
  await waitFor(() => expect(create).toHaveBeenCalledExactlyOnceWith({
    homeTeamId: home.id, awayTeamId: away.id, scheduledAt: new Date('2026-10-15T18:30').toISOString(),
  }));
  await screen.findByRole('article');
  expect(api.matches).toHaveBeenCalledTimes(2);
});
test('blank inputs show field errors without an API write', async () => {
  const create = vi.spyOn(api, 'createMatch');
  renderPage();
  await screen.findByRole('article');
  await openCreate();
  fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj utakmicu' }));
  expect(screen.getByText('Izaberite domaći tim.')).toBeTruthy();
  expect(screen.getByText('Izaberite gostujući tim.')).toBeTruthy();
  expect(screen.getByText('Unesite datum i vreme utakmice.')).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});
test('same team is disabled in the opposite participant selector', async () => {
  renderPage();
  await screen.findByRole('article');
  await openCreate();
  fireEvent.click(screen.getByRole('combobox', { name: /^Domaći tim/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Vojvodina · Novi Sad' }));
  fireEvent.click(screen.getByRole('combobox', { name: /^Gostujući tim/ }));
  expect((await screen.findByRole('option', { name: 'Vojvodina · Novi Sad' })).getAttribute('data-combobox-disabled')).not.toBeNull();
});
test('editing prefills participants and preserves the instant when unchanged', async () => {
  const update = vi.spyOn(api, 'updateMatch').mockResolvedValue(match);
  renderPage();
  await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button', { name: 'Izmeni' }));
  await waitFor(() => expect(screen.queryByText('Učitavanje timova…')).toBeNull());
  expect((screen.getByRole('combobox', { name: /^Domaći tim/ }) as HTMLInputElement).value).toBe('Vojvodina · Novi Sad');
  expect((screen.getByLabelText(/^Datum i vreme/) as HTMLInputElement).value).toBe(toLocalDateTime(match.scheduledAt).replace(/:00$/, ''));
  fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj izmene' }));
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith(match.id, {
    homeTeamId: home.id, awayTeamId: away.id, scheduledAt: match.scheduledAt,
  }));
});

test('saving an unchanged edit retains the original instant and subsecond precision in the API payload', async () => {
  const original = { ...match, scheduledAt: '2026-10-25T01:30:00.123456Z' };
  vi.mocked(api.matches).mockResolvedValue({ ...populated, content: [original] });
  const update = vi.spyOn(api, 'updateMatch').mockResolvedValue(original);
  renderPage(); await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button', { name: 'Izmeni' }));
  await waitFor(() => expect(screen.queryByText('Učitavanje timova…')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj izmene' }));
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith(original.id, {
    homeTeamId: home.id, awayTeamId: away.id, scheduledAt: original.scheduledAt,
  }));
});
test('failed save retains participants and date inside the editor', async () => {
  vi.spyOn(api, 'createMatch').mockRejectedValue(new ApiError('Tim više ne postoji.', 404));
  renderPage();
  await screen.findByRole('article');
  await openCreate();
  await chooseTeams();
  setDate();
  fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj utakmicu' }));
  await screen.findByText('Tim više ne postoji.');
  expect(screen.getByRole('form', { name: 'Nova utakmica' })).toBeTruthy();
  expect((screen.getByRole('combobox', { name: /^Domaći tim/ }) as HTMLInputElement).value).toBe('Vojvodina · Novi Sad');
  expect((screen.getByLabelText(/^Datum i vreme/) as HTMLInputElement).value).toBe('2026-10-15T18:30');
});
test('at least two teams are needed and team-loading failures can be retried', async () => {
  vi.mocked(api.teamOptions).mockRejectedValueOnce(new ApiError('Timovi nisu dostupni.', 503)).mockResolvedValue([home]);
  renderPage();
  await screen.findByRole('article');
  await openCreate();
  await screen.findByText('Timovi nisu dostupni.');
  expect((screen.getByRole('button', { name: 'Sačuvaj utakmicu' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Osveži timove' }));
  await screen.findByText(/potrebna najmanje dva tima/);
  expect((screen.getByRole('button', { name: 'Sačuvaj utakmicu' }) as HTMLButtonElement).disabled).toBe(true);
});
test('deletion requires inline confirmation and removes only after confirming', async () => {
  const remove = vi.spyOn(api, 'deleteMatch').mockResolvedValue();
  renderPage();
  await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button', { name: 'Obriši' }));
  const confirmation = screen.getByRole('region', { name: 'Brisanje utakmice' });
  expect(within(confirmation).getByText(/Timovi i igrači neće biti obrisani/)).toBeTruthy();
  expect(remove).not.toHaveBeenCalled();
  vi.mocked(api.matches).mockResolvedValue(empty);
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Obriši utakmicu' }));
  await screen.findByText('Još nema utakmica');
  expect(remove).toHaveBeenCalledExactlyOnceWith(match.id);
});
test('deletion conflict keeps the confirmation and match visible', async () => {
  vi.spyOn(api, 'deleteMatch').mockRejectedValue(new ApiError('Samo zakazana utakmica može da se izmeni ili obriše.', 409));
  renderPage();
  await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button', { name: 'Obriši' }));
  fireEvent.click(screen.getByRole('button', { name: 'Obriši utakmicu' }));
  await screen.findByText(/Samo zakazana utakmica/);
  expect(screen.getByRole('article')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Brisanje utakmice' })).toBeTruthy();
});
test.each(['LIVE', 'FINISHED'] as const)('%s matches have no edit or delete buttons', async (status) => {
  vi.mocked(api.matches).mockResolvedValue({ ...populated, content: [{ ...match, status }] });
  renderPage();
  await screen.findByRole('article');
  expect(screen.queryByRole('button', { name: 'Izmeni' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Obriši' })).toBeNull();
});
test('read failure can be retried', async () => {
  vi.mocked(api.matches).mockRejectedValueOnce(new ApiError('Lista nije dostupna.', 503));
  renderPage();
  await screen.findByText('Lista nije dostupna.');
  fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }));
  await screen.findByRole('article');
});
test('deleting the last item on a later page falls back to the remaining page', async () => {
  vi.mocked(api.matches).mockImplementation(async (page) => ({ ...populated, page, totalPages: 2, totalElements: 21 }));
  vi.spyOn(api, 'deleteMatch').mockResolvedValue();
  renderPage();
  await screen.findByRole('article');
  fireEvent.click(screen.getAllByRole('button').find((button) => button.textContent === '2')!);
  await waitFor(() => expect(api.matches).toHaveBeenLastCalledWith(1, expect.any(AbortSignal), {}));
  await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button', { name: 'Obriši' }));
  vi.mocked(api.matches).mockImplementation(async (page) => page === 1
    ? { ...empty, page, totalPages: 1, totalElements: 20 } : { ...populated, totalElements: 20 });
  fireEvent.click(screen.getByRole('button', { name: 'Obriši utakmicu' }));
  await waitFor(() => expect(api.matches).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), {}));
});
test('pending save disables cancellation and duplicate submits', async () => {
  let finish!: (value: Match) => void;
  const create = vi.spyOn(api, 'createMatch').mockImplementation(() => new Promise<Match>((resolve) => { finish = resolve; }));
  renderPage();
  await screen.findByRole('article');
  await openCreate();
  await chooseTeams();
  setDate();
  fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj utakmicu' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect((screen.getByRole('button', { name: 'Odustani' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Utakmice' }) as HTMLButtonElement).disabled).toBe(true);
  finish(match);
  await screen.findByRole('article');
});
test('Escape cancels inline deletion without a request', async () => {
  const user = userEvent.setup();
  const remove = vi.spyOn(api, 'deleteMatch');
  renderPage();
  await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button', { name: 'Obriši' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('region', { name: 'Brisanje utakmice' })).toBeNull();
  expect(remove).not.toHaveBeenCalled();
});
