import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Player, type Team } from '../../src/api/client';
import { PlayersPage } from '../../src/players/PlayersPage';
import { TeamsPage } from '../../src/teams/TeamsPage';
import { theme } from '../../src/theme';

const team: Team = { id: 'team-id', name: 'OK Vojvodina', city: 'Novi Sad', createdAt: '2026-10-08T10:00:00Z' };
const player: Player = { id: 'player-id', teamId: team.id, firstName: 'Marko', lastName: 'Marković',
  jerseyNumber: 7, position: 'SETTER', createdAt: '2026-10-08T10:00:00Z' };
const populated = { content: [player], page: 0, totalPages: 1, totalElements: 1 };
const empty = { content: [], page: 0, totalPages: 0, totalElements: 0 };

function renderPage(canManage = true, onBack = vi.fn()) {
  return render(<MantineProvider theme={theme} env="test">
    <PlayersPage team={team} canManage={canManage} onBack={onBack} />
  </MantineProvider>);
}
beforeEach(() => {
  vi.spyOn(api, 'team').mockResolvedValue(team);
  vi.spyOn(api, 'players').mockResolvedValue(populated);
  vi.spyOn(notifications, 'show').mockReturnValue('test-notification');
});
afterEach(() => vi.restoreAllMocks());

test('coach sees names, jersey and position without mutation controls', async () => {
  renderPage(false);
  const card = await screen.findByRole('article', { name: 'Marko Marković' });
  expect(within(card).getByText('Tehničar')).toBeTruthy();
  expect(within(card).getByLabelText('Broj dresa 7')).toBeTruthy();
  for (const name of ['Dodaj igrača', 'Izmeni', 'Obriši']) expect(screen.queryByRole('button', { name })).toBeNull();
});

test('team card opens roster and back returns to the team list', async () => {
  const user = userEvent.setup();
  vi.spyOn(api, 'teams').mockResolvedValue({ content: [team], page: 0, totalPages: 1, totalElements: 1 });
  render(<MantineProvider theme={theme} env="test"><TeamsPage canManage /></MantineProvider>);
  await user.click(await screen.findByRole('button', { name: 'Prikaži igrače' }));
  await screen.findByRole('article', { name: 'Marko Marković' });
  await user.click(screen.getByRole('button', { name: 'Nazad na timove' }));
  await screen.findByRole('article', { name: team.name });
});

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  const form = screen.getByRole('form', { name: 'Novi igrač' });
  fireEvent.change(within(form).getByLabelText(/^Ime/), { target: { value: ' Željko-Marko ' } });
  fireEvent.change(within(form).getByLabelText(/^Prezime/), { target: { value: ' Petrović ' } });
  fireEvent.change(within(form).getByLabelText(/^Broj dresa/), { target: { value: '12' } });
  await user.click(within(form).getByRole('combobox', { name: /Primarna pozicija/ }));
  expect(screen.getAllByRole('option')).toHaveLength(5);
  await user.click(screen.getByRole('option', { name: 'Libero' }));
  return form;
}

test('add form offers five positions and sends normalized data scoped to the team', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api, 'createPlayer').mockResolvedValue(player);
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj igrača' }));
  const form = await fillForm(user);
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj igrača' }));
  await waitFor(() => expect(create).toHaveBeenCalledExactlyOnceWith(team.id,
    { firstName: 'Željko-Marko', lastName: 'Petrović', jerseyNumber: 12, position: 'LIBERO' }));
  await waitFor(() => expect(api.players).toHaveBeenCalledTimes(2));
});

test('blank fields show inline errors and invalid text keeps normal color', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api, 'createPlayer');
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj igrača' }));
  const form = screen.getByRole('form');
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj igrača' }));
  for (const text of ['Unesite ime.', 'Unesite prezime.', 'Unesite broj dresa.', 'Izaberite poziciju.']) {
    expect(within(form).getByText(text)).toBeTruthy();
  }
  const firstName = within(form).getByLabelText(/^Ime/);
  fireEvent.change(firstName, { target: { value: 'Marko123' } });
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj igrača' }));
  expect(within(form).getByText(/Ime može da sadrži slova/)).toBeTruthy();
  expect((firstName as HTMLInputElement).style.color).toBe('var(--mantine-color-text)');
  expect(create).not.toHaveBeenCalled();
});

test('edit prefills current name, jersey and position and preserves team association', async () => {
  const user = userEvent.setup();
  const update = vi.spyOn(api, 'updatePlayer').mockResolvedValue(player);
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Izmeni' }));
  const form = screen.getByRole('form', { name: 'Izmena igrača' });
  expect((within(form).getByLabelText(/^Ime/) as HTMLInputElement).value).toBe(player.firstName);
  expect((within(form).getByLabelText(/^Broj dresa/) as HTMLInputElement).value).toBe('7');
  expect((within(form).getByRole('combobox', { name: /Primarna pozicija/ }) as HTMLInputElement).value).toBe('Tehničar');
  fireEvent.change(within(form).getByLabelText(/^Broj dresa/), { target: { value: '12' } });
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj izmene' }));
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith(team.id, player.id,
    { firstName: player.firstName, lastName: player.lastName, jerseyNumber: 12, position: player.position }));
});

test('duplicate jersey failure retains entered values and permits retry', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api, 'createPlayer')
    .mockRejectedValueOnce(new ApiError('Igrač sa ovim brojem dresa već postoji u timu.', 409))
    .mockResolvedValueOnce(player);
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj igrača' }));
  const form = await fillForm(user);
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj igrača' }));
  await within(form).findByText('Igrač sa ovim brojem dresa već postoji u timu.');
  expect((within(form).getByLabelText(/^Ime/) as HTMLInputElement).value).toBe(' Željko-Marko ');
  expect(notifications.show).not.toHaveBeenCalled();
  fireEvent.change(within(form).getByLabelText(/^Broj dresa/), { target: { value: '13' } });
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj igrača' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
});

test('deletion requires confirmation and refreshes an empty roster', async () => {
  const user = userEvent.setup();
  const remove = vi.spyOn(api, 'deletePlayer').mockResolvedValue();
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Obriši' }));
  const form = screen.getByRole('region', { name: 'Brisanje igrača' });
  expect(within(form).getByText(/trajno obrisan iz baze/)).toBeTruthy();
  expect(remove).not.toHaveBeenCalled();
  await user.click(within(form).getByRole('button', { name: 'Odustani' }));
  expect(remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Obriši' }));
  vi.mocked(api.players).mockResolvedValue(empty);
  await user.click(screen.getByRole('button', { name: 'Obriši igrača' }));
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(team.id, player.id));
  await screen.findByText('Tim još nema igrače');
});

test('deletion error keeps confirmation open without success notification', async () => {
  const user = userEvent.setup();
  vi.spyOn(api, 'deletePlayer').mockRejectedValue(new ApiError('Brisanje nije uspelo.', 409));
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Obriši' }));
  await user.click(screen.getByRole('button', { name: 'Obriši igrača' }));
  await screen.findByText('Brisanje nije uspelo.');
  expect(screen.getByRole('region', { name: 'Brisanje igrača' })).toBeTruthy();
  expect(notifications.show).not.toHaveBeenCalled();
});

test('missing team read shows an error and back remains available', async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  vi.mocked(api.team).mockRejectedValue(new ApiError('Tim nije pronađen.', 404));
  renderPage(true, onBack);
  await screen.findByText('Tim nije pronađen.');
  expect((screen.getByRole('button', { name: 'Dodaj igrača' }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Nazad na timove' }));
  expect(onBack).toHaveBeenCalledOnce();
});

test('failed roster load can be retried', async () => {
  const user = userEvent.setup();
  vi.mocked(api.players).mockRejectedValueOnce(new ApiError('Lista nije dostupna.', 503));
  renderPage();
  await screen.findByText('Lista nije dostupna.');
  await user.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }));
  await screen.findByRole('article', { name: 'Marko Marković' });
});

test('deleting last player on a later page navigates to the previous page', async () => {
  const user = userEvent.setup();
  vi.mocked(api.players).mockImplementation(async (_teamId, page) => ({ ...populated, page, totalPages: 2, totalElements: 21 }));
  vi.spyOn(api, 'deletePlayer').mockResolvedValue();
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getAllByRole('button').find((button) => button.textContent === '2')!);
  await waitFor(() => expect(api.players).toHaveBeenLastCalledWith(team.id, 1, expect.any(AbortSignal)));
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Obriši' }));
  vi.mocked(api.players).mockImplementation(async (_teamId, page) => page === 1
    ? { ...empty, page: 1, totalPages: 1, totalElements: 20 }
    : { ...populated, page: 0, totalPages: 1, totalElements: 20 });
  await user.click(screen.getByRole('button', { name: 'Obriši igrača' }));
  await waitFor(() => expect(api.players).toHaveBeenLastCalledWith(team.id, 0, expect.any(AbortSignal)));
});

test('player editor replaces roster and both cancel and roster breadcrumb return without a write', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api, 'createPlayer');
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj igrača' }));
  expect(screen.queryByRole('article')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Novi igrač', level: 1 }));
  const navigation = screen.getByRole('navigation', { name: 'Putanja' });
  expect(within(navigation).getByText(team.name)).toBeTruthy();
  await user.click(within(navigation).getByRole('button', { name: 'Igrači' }));
  await screen.findByRole('article', { name: 'Marko Marković' });
  await user.click(screen.getByRole('button', { name: 'Dodaj igrača' }));
  await user.click(screen.getByRole('button', { name: 'Odustani' }));
  await screen.findByRole('article', { name: 'Marko Marković' });
  expect(create).not.toHaveBeenCalled();
});

test('player form team-list breadcrumb returns through its parent callback', async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  renderPage(true, onBack);
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Izmeni' }));
  await user.click(within(screen.getByRole('navigation', { name: 'Putanja' })).getByRole('button', { name: 'Timovi' }));
  expect(onBack).toHaveBeenCalledOnce();
});

test('player deletion confirmation belongs to the chosen card and other actions wait for cancellation', async () => {
  const user = userEvent.setup();
  const second = { ...player, id: 'second-id', firstName: 'Petar', jerseyNumber: 12 };
  vi.mocked(api.players).mockResolvedValue({ ...populated, content: [player, second], totalElements: 2 });
  const remove = vi.spyOn(api, 'deletePlayer');
  renderPage();
  const firstCard = await screen.findByRole('article', { name: 'Marko Marković' });
  const secondCard = screen.getByRole('article', { name: 'Petar Marković' });
  await user.click(within(firstCard).getByRole('button', { name: 'Obriši' }));
  expect(within(firstCard).getByRole('region', { name: 'Brisanje igrača' })).toBeTruthy();
  expect(within(secondCard).queryByRole('region')).toBeNull();
  expect((within(secondCard).getByRole('button', { name: 'Obriši' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Osveži' }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(within(firstCard).getByRole('button', { name: 'Odustani' }));
  expect((within(secondCard).getByRole('button', { name: 'Obriši' }) as HTMLButtonElement).disabled).toBe(false);
  expect(remove).not.toHaveBeenCalled();
});
