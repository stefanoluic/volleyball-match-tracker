import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type User } from '../../src/api/client';
import { App } from '../../src/App';

vi.mock('../../src/teams/TeamsPage', () => ({ TeamsPage: ({ canManage }: { canManage: boolean }) =>
  <div><h1>Timovi</h1><input aria-label="Probni unos" defaultValue="" />{canManage && <button>Dodaj tim</button>}</div> }));
vi.mock('../../src/matches/MatchesPage', () => ({ MatchesPage: () => <h1>Utakmice</h1> }));
vi.mock('../../src/admin/AdminUsersPage', () => ({ AdminUsersPage: () => <h1>Korisnički nalozi</h1> }));

const account: User = { id: 'one', firstName: 'Prvi', lastName: 'Korisnik', email: 'one@example.com',
  role: 'STATISTICIAN', status: 'ACTIVE', createdAt: '2026-10-24T10:00:00Z' };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
async function open() {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<MantineProvider env="test"><App /></MantineProvider>); });
  return view;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(api, 'me').mockResolvedValue(account);
  vi.spyOn(api, 'logout').mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('session reads use a thirty-second delay and never overlap a pending check', async () => {
  await open(); expect(api.me).toHaveBeenCalledTimes(1);
  let resolve!: (user: User) => void;
  vi.mocked(api.me).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await advance(29_999); expect(api.me).toHaveBeenCalledTimes(1);
  await advance(1); await advance(9_000); expect(api.me).toHaveBeenCalledTimes(2);
  await act(async () => resolve(account));
  await advance(29_999); expect(api.me).toHaveBeenCalledTimes(2);
  await advance(1); expect(api.me).toHaveBeenCalledTimes(3);
});

test('hidden tabs cancel their session check and stay quiet until visible and online', async () => {
  await open(); vi.mocked(api.me).mockReturnValueOnce(new Promise(() => {}));
  await advance(30_000); const signal = vi.mocked(api.me).mock.calls[1][1]!;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(signal.aborted).toBe(true); await advance(90_000); expect(api.me).toHaveBeenCalledTimes(2);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(api.me).toHaveBeenCalledTimes(2);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(api.me).toHaveBeenCalledTimes(3);
});

test('a temporary failure keeps the user signed in; recovery removes only the session warning', async () => {
  await open(); vi.mocked(api.me).mockRejectedValueOnce(new ApiError('Proba prekida veze.', 503));
  await advance(30_000); expect(screen.getByText('Provera sesije nije uspela')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Odjavi se' })).toBeTruthy();
  await advance(59_999); expect(api.me).toHaveBeenCalledTimes(2);
  await advance(1); expect(api.me).toHaveBeenCalledTimes(3);
  expect(screen.queryByText('Provera sesije nije uspela')).toBeNull();
});

test('a manual retry checks immediately after a terminal failure rather than waiting thirty seconds', async () => {
  await open(); vi.mocked(api.me).mockRejectedValueOnce(new ApiError('Pristup nije potvrđen.', 403));
  await advance(30_000); await advance(120_000); expect(api.me).toHaveBeenCalledTimes(2);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ponovi proveru sesije' })));
  await advance(0); expect(api.me).toHaveBeenCalledTimes(3);
  expect(screen.queryByText('Provera sesije nije uspela')).toBeNull();
});

test('a blocked session returns to authentication when the API reports expiration', async () => {
  await open(); vi.mocked(api.me).mockImplementationOnce(async () => {
    window.dispatchEvent(new Event('session-expired')); throw new ApiError('Potrebna je prijava.', 401);
  });
  await advance(30_000); expect(screen.getByRole('button', { name: 'Prijavi se' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Timovi' })).toBeNull();
  await advance(120_000); expect(api.me).toHaveBeenCalledTimes(2);
});

test('a different account detected in another tab clears the previous account screens and drafts', async () => {
  await open(); fireEvent.change(screen.getByRole('textbox', { name: 'Probni unos' }), { target: { value: 'Stari unos' } });
  vi.mocked(api.me).mockResolvedValue({ ...account, id: 'two', firstName: 'Drugi', role: 'COACH' });
  await advance(30_000);
  expect(screen.getByText('Drugi Korisnik')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Dodaj tim' })).toBeNull();
  expect((screen.getByRole('textbox', { name: 'Probni unos' }) as HTMLInputElement).value).toBe('');
});

test('a role change for the same account also resets old write controls', async () => {
  await open(); vi.mocked(api.me).mockResolvedValue({ ...account, role: 'ADMIN' });
  await advance(30_000); expect(screen.getByRole('heading', { name: 'Korisnički nalozi' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Dodaj tim' })).toBeNull();
});

test('logout aborts an in-flight session check and its late result cannot sign the user back in', async () => {
  await open(); let resolve!: (user: User) => void;
  vi.mocked(api.me).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await advance(30_000); const signal = vi.mocked(api.me).mock.calls[1][1]!;
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Odjavi se' })));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(account));
  expect(screen.getByRole('button', { name: 'Prijavi se' })).toBeTruthy();
});

test('unmount cancels the initial session read rather than letting it complete in the background', async () => {
  vi.mocked(api.me).mockReturnValueOnce(new Promise(() => {}));
  const view = await open(); const signal = vi.mocked(api.me).mock.calls[0][1]!;
  view.unmount(); expect(signal.aborted).toBe(true); await advance(120_000);
  expect(api.me).toHaveBeenCalledTimes(1);
});
