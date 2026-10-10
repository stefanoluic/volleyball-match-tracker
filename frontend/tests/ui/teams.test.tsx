import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Team } from '../../src/api/client';
import { TeamsPage } from '../../src/teams/TeamsPage';
import { theme } from '../../src/theme';

const team: Team = { id: 'team-id', name: 'OK Vojvodina', city: 'Novi Sad', createdAt: '2026-10-08T10:00:00Z' };
const populated = { content: [team], page: 0, totalPages: 1, totalElements: 1 };
const empty = { content: [], page: 0, totalPages: 0, totalElements: 0 };

function renderPage(canManage = true) {
  return render(<MantineProvider theme={theme} env="test"><TeamsPage canManage={canManage} /></MantineProvider>);
}

beforeEach(() => {
  vi.spyOn(api, 'teams').mockResolvedValue(populated);
  vi.spyOn(notifications, 'show').mockReturnValue('test-notification');
});
afterEach(() => vi.restoreAllMocks());

test('coaching staff can view teams but has no mutation controls', async () => {
  renderPage(false);
  const card = await screen.findByRole('article', { name: team.name });
  expect(within(card).getByText(team.city)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Dodaj tim' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Izmeni' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Obriši' })).toBeNull();
  expect(screen.getByText('Pristup za pregled')).toBeTruthy();
});

test('statistician adds a team and the list refreshes', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api, 'createTeam').mockResolvedValue(team);
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj tim' }));
  const form = screen.getByRole('form', { name: 'Novi tim' });
  await user.type(within(form).getByLabelText(/^Naziv tima/), ' New team ');
  await user.type(within(form).getByLabelText(/^Grad/), ' Beograd ');
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj tim' }));
  await waitFor(() => expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'New team', city: 'Beograd' }));
  await waitFor(() => expect(api.teams).toHaveBeenCalledTimes(2));
  expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tim je dodat', role: 'status' }));
});

test('blank fields are rejected inline without an API write', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api, 'createTeam');
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj tim' }));
  await user.click(screen.getByRole('button', { name: 'Sačuvaj tim' }));
  expect(screen.getByText('Unesite naziv tima.')).toBeTruthy();
  expect(screen.getByText('Unesite grad.')).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

test('editing prefills the current values and sends a PUT through the API', async () => {
  const user = userEvent.setup();
  const update = vi.spyOn(api, 'updateTeam').mockResolvedValue({ ...team, city: 'Beograd' });
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Izmeni' }));
  const form = screen.getByRole('form', { name: 'Izmena tima' });
  expect((within(form).getByLabelText(/^Naziv tima/) as HTMLInputElement).value).toBe(team.name);
  const city = within(form).getByLabelText(/^Grad/);
  await user.clear(city);
  await user.type(city, 'Beograd');
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj izmene' }));
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith(team.id, { name: team.name, city: 'Beograd' }));
});

test('duplicate errors stay inside the editor and keep the entered data', async () => {
  const user = userEvent.setup();
  vi.spyOn(api, 'createTeam').mockRejectedValue(new ApiError('Tim sa ovim nazivom i gradom već postoji.', 409));
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj tim' }));
  const form = screen.getByRole('form', { name: 'Novi tim' });
  fireEvent.change(within(form).getByLabelText(/^Naziv tima/), { target: { value: team.name } });
  fireEvent.change(within(form).getByLabelText(/^Grad/), { target: { value: team.city } });
  await user.click(within(form).getByRole('button', { name: 'Sačuvaj tim' }));
  await within(form).findByText('Tim sa ovim nazivom i gradom već postoji.');
  expect(screen.getByRole('form')).toBeTruthy();
  expect((within(form).getByLabelText(/^Naziv tima/) as HTMLInputElement).value).toBe(team.name);
  expect(notifications.show).not.toHaveBeenCalled();
});

test('deletion can be cancelled and only confirmation calls the API', async () => {
  const user = userEvent.setup();
  const remove = vi.spyOn(api, 'deleteTeam').mockResolvedValue();
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Obriši' }));
  let form = screen.getByRole('region', { name: 'Brisanje tima' });
  expect(within(form).getByText(/nije moguće poništiti/)).toBeTruthy();
  expect(remove).not.toHaveBeenCalled();
  await user.click(within(form).getByRole('button', { name: 'Odustani' }));
  await user.click(screen.getByRole('button', { name: 'Obriši' }));
  form = screen.getByRole('region', { name: 'Brisanje tima' });
  vi.mocked(api.teams).mockResolvedValue(empty);
  await user.click(within(form).getByRole('button', { name: 'Obriši tim' }));
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(team.id));
  await screen.findByText('Još nema timova');
});

test('read failures show a retry control and recover', async () => {
  const user = userEvent.setup();
  vi.mocked(api.teams).mockRejectedValueOnce(new ApiError('Lista nije dostupna.', 503));
  renderPage();
  await screen.findByText('Lista nije dostupna.');
  await user.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }));
  await screen.findByRole('article', { name: team.name });
});

test('team with players shows the deletion guard message and keeps the team visible', async () => {
  const user = userEvent.setup();
  vi.spyOn(api, 'deleteTeam').mockRejectedValue(new ApiError('Tim nije moguće obrisati dok ima igrače.', 409));
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Obriši' }));
  await user.click(screen.getByRole('button', { name: 'Obriši tim' }));
  await screen.findByText('Tim nije moguće obrisati dok ima igrače.');
  expect(screen.getByRole('region', { name: 'Brisanje tima' })).toBeTruthy();
  expect(screen.getByRole('article', { name: team.name })).toBeTruthy();
  expect(notifications.show).not.toHaveBeenCalled();
});

test('deleting the last item on a later page returns to the previous page', async () => {
  const user = userEvent.setup();
  vi.mocked(api.teams).mockImplementation(async (page) => page === 0
    ? { ...populated, page: 0, totalPages: 2, totalElements: 21 }
    : { ...populated, page: 1, totalPages: 2, totalElements: 21 });
  vi.spyOn(api, 'deleteTeam').mockResolvedValue();
  renderPage();
  await screen.findByRole('article');
  const pageTwo = screen.getAllByRole('button').find((button) => button.textContent === '2')!;
  await user.click(pageTwo);
  await waitFor(() => expect(api.teams).toHaveBeenLastCalledWith(1, expect.any(AbortSignal)));
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Obriši' }));
  vi.mocked(api.teams).mockImplementation(async (page) => page === 1
    ? { ...empty, page: 1, totalPages: 1, totalElements: 20 }
    : { ...populated, page: 0, totalPages: 1, totalElements: 20 });
  await user.click(screen.getByRole('button', { name: 'Obriši tim' }));
  await waitFor(() => expect(api.teams).toHaveBeenLastCalledWith(0, expect.any(AbortSignal)));
});

test('team editor is a dedicated screen with breadcrumbs, heading focus and no modal', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(api, 'createTeam');
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj tim' }));
  const heading = screen.getByRole('heading', { name: 'Novi tim', level: 1 });
  expect(document.activeElement).toBe(heading);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('article')).toBeNull();
  const navigation = screen.getByRole('navigation', { name: 'Putanja' });
  expect(within(navigation).getByText('Novi tim').getAttribute('aria-current')).toBe('page');
  fireEvent.change(screen.getByLabelText(/^Naziv tima/), { target: { value: 'Unsaved team' } });
  await user.click(screen.getByRole('button', { name: 'Odustani' }));
  await screen.findByRole('article', { name: team.name });
  expect(create).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Dodaj tim' }));
  expect((screen.getByLabelText(/^Naziv tima/) as HTMLInputElement).value).toBe('');
});

test('team breadcrumb exits editing without sending a write', async () => {
  const user = userEvent.setup();
  const update = vi.spyOn(api, 'updateTeam');
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Izmeni' }));
  const navigation = screen.getByRole('navigation', { name: 'Putanja' });
  expect(within(navigation).getByText(team.name)).toBeTruthy();
  await user.click(within(navigation).getByRole('button', { name: 'Timovi' }));
  await screen.findByRole('article', { name: team.name });
  expect(update).not.toHaveBeenCalled();
});

test('pending team save disables cancel and breadcrumb navigation until completion', async () => {
  const user = userEvent.setup();
  let finish!: (value: Team) => void;
  vi.spyOn(api, 'createTeam').mockImplementation(() => new Promise<Team>((resolve) => { finish = resolve; }));
  renderPage();
  await screen.findByRole('article');
  await user.click(screen.getByRole('button', { name: 'Dodaj tim' }));
  fireEvent.change(screen.getByLabelText(/^Naziv tima/), { target: { value: 'New team' } });
  fireEvent.change(screen.getByLabelText(/^Grad/), { target: { value: 'Novi Sad' } });
  await user.click(screen.getByRole('button', { name: 'Sačuvaj tim' }));
  const back = screen.getByRole('button', { name: 'Timovi' }) as HTMLButtonElement;
  expect(back.disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Odustani' }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(back);
  expect(screen.getByRole('form', { name: 'Novi tim' })).toBeTruthy();
  finish(team);
  await screen.findByRole('article', { name: team.name });
});

test('team deletion confirmation is scoped to its card and Escape cancels without deleting', async () => {
  const user = userEvent.setup();
  const remove = vi.spyOn(api, 'deleteTeam');
  renderPage();
  const card = await screen.findByRole('article', { name: team.name });
  await user.click(within(card).getByRole('button', { name: 'Obriši' }));
  const confirmation = within(card).getByRole('region', { name: 'Brisanje tima' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(within(confirmation).getByRole('heading'));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('region', { name: 'Brisanje tima' })).toBeNull();
  expect(remove).not.toHaveBeenCalled();
});
