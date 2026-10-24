import { act, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, READ_TIMEOUT_MS } from '../../src/api/client';
import { App } from '../../src/App';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const advance = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS); }); };

test('a hanging GET ends with a readable timeout and aborts the network request without retrying', async () => {
  const read = vi.fn(async (_path: string, _options: RequestInit) => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', read);
  const result = api.teams(0).catch(failure => failure);
  await advance();
  expect(await result).toMatchObject({ status: 504, message: 'Server nije odgovorio na vreme. Pokušajte ponovo.' });
  expect(read.mock.calls[0][1].signal?.aborted).toBe(true);
  expect(read).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

test('the deadline includes a hanging response body, not only response headers', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })));
  const result = api.teams(0).catch(failure => failure);
  await advance(); expect(await result).toBeInstanceOf(ApiError);
});

test('caller cancellation aborts the child request and suppresses a late unauthorized response', async () => {
  let resolve!: (response: Response) => void;
  const read = vi.fn(async (_path: string, _options: RequestInit) => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal('fetch', read);
  const expire = vi.fn(); window.addEventListener('session-expired', expire);
  try {
    const controller = new AbortController();
    const result = api.me(true, controller.signal).catch(failure => failure);
    controller.abort(); expect((await result).name).toBe('AbortError');
    expect(read.mock.calls[0][1].signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json({ message: 'Expired' }, { status: 401 })));
    expect(expire).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  } finally { window.removeEventListener('session-expired', expire); }
});

test('cancelling while an error body is pending cannot expire a newer session', async () => {
  let resolve!: (body: object) => void;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: () => new Promise(done => { resolve = done; }) })));
  const expire = vi.fn(); window.addEventListener('session-expired', expire);
  try {
    const controller = new AbortController();
    const result = api.me(true, controller.signal).catch(failure => failure);
    await act(async () => {}); controller.abort(); await result;
    await act(async () => resolve({ message: 'Expired' }));
    expect(expire).not.toHaveBeenCalled();
  } finally { window.removeEventListener('session-expired', expire); }
});

test('an already cancelled read never reaches fetch; a successful read leaves no deadline timer', async () => {
  const read = vi.fn(async () => Response.json({ content: [] })); vi.stubGlobal('fetch', read);
  const controller = new AbortController(); controller.abort();
  await expect(api.teams(0, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(read).not.toHaveBeenCalled();
  await expect(api.teams(0)).resolves.toEqual({ content: [] }); expect(vi.getTimerCount()).toBe(0);
});

test('a CSRF read timeout prevents a mutation from being sent', async () => {
  const read = vi.fn(async (_path: string) => new Promise<Response>(() => {})); vi.stubGlobal('fetch', read);
  const result = api.createTeam({ name: 'Test', city: 'Test' }).catch(failure => failure);
  await advance(); expect((await result).status).toBe(504);
  expect(read).toHaveBeenCalledTimes(1); expect(read.mock.calls[0]?.[0]).toBe('/api/auth/csrf');
});

test('a pending mutation is not timed out or retried after the CSRF read succeeds', async () => {
  let resolve!: (response: Response) => void;
  const read = vi.fn(async (path: string) => path === '/api/auth/csrf'
    ? Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' }) : new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal('fetch', read);
  let settled = false;
  const result = api.createTeam({ name: 'Test', city: 'Test' }).finally(() => { settled = true; });
  await act(async () => {}); await advance();
  expect(settled).toBe(false); expect(read).toHaveBeenCalledTimes(2);
  resolve(Response.json({ id: 'team' })); await expect(result).resolves.toEqual({ id: 'team' });
});

test('a hung startup session check offers retry instead of leaving the app loading forever', async () => {
  const read = vi.fn(async () => new Promise<Response>(() => {})); vi.stubGlobal('fetch', read);
  await act(async () => { render(<MantineProvider env="test"><App /></MantineProvider>); });
  expect(screen.getByLabelText('Provera sesije')).toBeTruthy(); await advance();
  expect(screen.queryByLabelText('Provera sesije')).toBeNull();
  expect(screen.getByText('Server nije odgovorio na vreme. Pokušajte ponovo.')).toBeTruthy();
  read.mockResolvedValue(Response.json({}, { status: 401 }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' })));
  expect(screen.getByRole('button', { name: 'Prijavi se' })).toBeTruthy();
});
