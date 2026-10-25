import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPage } from '../../src/api/client';
import { MatchesPage } from '../../src/matches/MatchesPage';

vi.mock('../../src/matches/MatchPreparationPage', () => ({
  MatchPreparationPage: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>Nazad na utakmice</button>,
}));

const home = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-24T10:00:00Z' };
const away = { ...home, id: 'away', name: 'Partizan', city: 'Beograd' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, scheduledAt: home.createdAt,
  createdAt: home.createdAt, status: 'SCHEDULED' };
const populated: MatchPage = { content: [match], page: 0, totalPages: 1, totalElements: 1 };
const empty: MatchPage = { content: [], page: 0, totalPages: 0, totalElements: 0 };
beforeEach(() => {
  vi.spyOn(api, 'matches').mockResolvedValue(populated);
  vi.spyOn(notifications, 'show').mockReturnValue('notice');
});
afterEach(() => vi.restoreAllMocks());
async function open(canManage = true) {
  render(<MantineProvider env="test"><MatchesPage canManage={canManage} /></MantineProvider>);
  await screen.findByRole('article');
}
async function status(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Status utakmice' }));
  fireEvent.click(await screen.findByRole('option', { name: label }));
}
function search(value: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Naziv tima' }), { target: { value } }); }
function apply() { fireEvent.click(screen.getByRole('button', { name: 'Primeni filtere' })); }
function pageTwo() { fireEvent.click(screen.getAllByRole('button').find(button => button.textContent === '2')!); }

test('coach can combine name, status and inclusive calendar dates without write permissions', async () => {
  const create = vi.spyOn(api, 'createMatch');
  await open(false); search('  Vojvodina  '); await status('Završene');
  fireEvent.change(screen.getByLabelText('Od datuma'), { target: { value: '2026-10-24' } });
  fireEvent.change(screen.getByLabelText('Do datuma'), { target: { value: '2026-10-25' } });
  expect(api.matches).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Prikaz koristi prethodni izbor/)).toBeTruthy();
  apply();
  await waitFor(() => expect(api.matches).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), {
    q: 'Vojvodina', status: 'FINISHED', from: new Date('2026-10-24T00:00:00').toISOString(),
    until: new Date('2026-10-26T00:00:00').toISOString(),
  }));
  expect(screen.queryByRole('button', { name: 'Dodaj utakmicu' })).toBeNull();
  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByText(/Prikaz koristi prethodni izbor/)).toBeNull();
});

test('reversed dates are rejected without fetching or clearing entered values', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('Od datuma'), { target: { value: '2026-10-25' } });
  fireEvent.change(screen.getByLabelText('Do datuma'), { target: { value: '2026-10-24' } });
  apply(); expect(screen.getByText('Krajnji datum ne može biti pre početnog.')).toBeTruthy();
  expect(api.matches).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText('Od datuma') as HTMLInputElement).value).toBe('2026-10-25');
  expect(screen.getByRole('article')).toBeTruthy();
});

test('applying filters resets pagination once; paging and refresh keep the same filters', async () => {
  vi.mocked(api.matches).mockImplementation(async (page) => ({ ...populated, page, totalPages: 2, totalElements: 21 }));
  await open(); pageTwo();
  await waitFor(() => expect(api.matches).toHaveBeenLastCalledWith(1, expect.any(AbortSignal), {}));
  await screen.findByRole('article'); const before = vi.mocked(api.matches).mock.calls.length;
  search('Vojvodina'); apply();
  await waitFor(() => expect(api.matches).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { q: 'Vojvodina' }));
  expect(vi.mocked(api.matches).mock.calls.slice(before)).toHaveLength(1);
  await screen.findByText('Pronađeno utakmica: 21'); pageTwo();
  await waitFor(() => expect(api.matches).toHaveBeenLastCalledWith(1, expect.any(AbortSignal), { q: 'Vojvodina' }));
  await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button', { name: 'Osveži' }));
  await waitFor(() => expect(api.matches).toHaveBeenCalledTimes(before + 3));
  expect(api.matches).toHaveBeenLastCalledWith(1, expect.any(AbortSignal), { q: 'Vojvodina' });
});

test('filtered empty results differ from an empty database and clearing restores all matches', async () => {
  await open(); vi.mocked(api.matches).mockResolvedValueOnce(empty).mockResolvedValue(populated);
  search('Nepostojeći'); await status('Završene'); apply();
  await screen.findByText('Nema utakmica za izabrane filtere');
  expect(screen.queryByText('Još nema utakmica')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Poništi filtere' }));
  await screen.findByRole('article');
  expect(api.matches).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), {});
  expect((screen.getByRole('textbox', { name: 'Naziv tima' }) as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('combobox', { name: 'Status utakmice' }) as HTMLInputElement).value).toBe('Sve utakmice');
});

test('a superseded request is aborted and its late result cannot replace the newest filters', async () => {
  let resolve!: (data: MatchPage) => void;
  await open(); vi.mocked(api.matches).mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue(empty);
  search('Staro'); apply();
  await waitFor(() => expect(api.matches).toHaveBeenCalledTimes(2));
  const oldSignal = vi.mocked(api.matches).mock.calls[1][1]!;
  search('Novo'); apply(); await screen.findByText('Nema utakmica za izabrane filtere');
  expect(oldSignal.aborted).toBe(true); await act(async () => resolve(populated));
  expect(screen.queryByRole('article')).toBeNull();
  expect((screen.getByRole('textbox', { name: 'Naziv tima' }) as HTMLInputElement).value).toBe('Novo');
});

test('filters remain selected after opening a match and returning to the list', async () => {
  await open(); search('Vojvodina'); await status('Zakazane'); apply(); await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button', { name: 'Početne postave' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nazad na utakmice' }));
  await screen.findByRole('article');
  expect(api.matches).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { q: 'Vojvodina', status: 'SCHEDULED' });
  expect((screen.getByRole('textbox', { name: 'Naziv tima' }) as HTMLInputElement).value).toBe('Vojvodina');
});

test('failed filtered reads can be retried without losing criteria', async () => {
  await open(); vi.mocked(api.matches).mockRejectedValueOnce(new ApiError('Pretraga nije dostupna.', 503)).mockResolvedValue(populated);
  search('Vojvodina'); apply(); await screen.findByText('Pretraga nije dostupna.');
  fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }));
  await screen.findByRole('article');
  expect(api.matches).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { q: 'Vojvodina' });
});

test('pending deletion locks filters until cancellation', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Obriši' }));
  expect((screen.getByRole('button', { name: 'Primeni filtere' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('textbox', { name: 'Naziv tima' }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Odustani' }));
  expect((screen.getByRole('button', { name: 'Primeni filtere' }) as HTMLButtonElement).disabled).toBe(false);
});
