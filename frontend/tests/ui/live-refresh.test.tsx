import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import { useLiveRefresh } from '../../src/matches/useLiveRefresh';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

test('polling starts after three seconds and schedules the next read only after success', async () => {
  const read = vi.fn(async (_signal: AbortSignal) => {});
  const { result } = renderHook(() => useLiveRefresh(true, 'match', read));
  expect(read).not.toHaveBeenCalled(); await advance(2999); expect(read).not.toHaveBeenCalled();
  await advance(1); expect(read).toHaveBeenCalledTimes(1); expect(result.current.lastUpdated).not.toBeNull();
  await advance(3000); expect(read).toHaveBeenCalledTimes(2);
});
test('slow requests never overlap and completion starts a new three-second delay', async () => {
  let resolve!: () => void;
  const read = vi.fn((_signal: AbortSignal) => new Promise<void>(done => { resolve = done; }));
  renderHook(() => useLiveRefresh(true, 'match', read));
  await advance(3000); await advance(9000); expect(read).toHaveBeenCalledTimes(1);
  await act(async () => resolve()); await advance(2999); expect(read).toHaveBeenCalledTimes(1);
  await advance(1); expect(read).toHaveBeenCalledTimes(2);
});
test('network failures use bounded backoff and success clears the stale warning', async () => {
  const read = vi.fn(async (_signal: AbortSignal) => { throw new Error('offline'); });
  const { result } = renderHook(() => useLiveRefresh(true, 'match', read));
  await advance(3000); expect(result.current.status).toBe('retrying'); expect(result.current.retryDelay).toBe(6000);
  await advance(6000); expect(result.current.retryDelay).toBe(12000);
  await advance(12000); expect(result.current.retryDelay).toBe(24000);
  await advance(24000); expect(result.current.retryDelay).toBe(30000);
  read.mockResolvedValue(undefined as never);
  await advance(30000); expect(result.current.error).toBe(''); expect(result.current.status).toBe('waiting');
  await advance(3000); expect(read).toHaveBeenCalledTimes(6);
});
for (const status of [401, 403, 404]) {
  test('terminal HTTP ' + status + ' stops requests until an explicit resource refresh', async () => {
    const read = vi.fn(async (_signal: AbortSignal) => { throw new ApiError('No access', status); });
    const { result, rerender } = renderHook(({ key }) => useLiveRefresh(true, key, read), { initialProps: { key: 'a' } });
    await advance(3000); expect(result.current.status).toBe('stopped');
    await advance(120000); expect(read).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event('online'))); await advance(10000); expect(read).toHaveBeenCalledTimes(1);
    rerender({ key: 'manual-refresh' }); await advance(3000); expect(read).toHaveBeenCalledTimes(2);
  });
}
for (const status of [429, 503]) {
  test('HTTP ' + status + ' is retryable rather than a permanent stop', async () => {
    const read = vi.fn(async (_signal: AbortSignal) => { throw new ApiError('Try later', status); });
    const { result } = renderHook(() => useLiveRefresh(true, 'match', read));
    await advance(3000); expect(result.current.status).toBe('retrying');
    await advance(6000); expect(read).toHaveBeenCalledTimes(2);
  });
}
test('hidden tabs abort the pending read and resume immediately when visible', async () => {
  let reject!: (failure: Error) => void;
  const read = vi.fn((_signal: AbortSignal) => new Promise<void>((_done, fail) => { reject = fail; }));
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  const { result } = renderHook(() => useLiveRefresh(true, 'match', read));
  await advance(3000); const signal = read.mock.calls[0][0];
  visibility.mockReturnValue('hidden'); act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(signal.aborted).toBe(true); expect(result.current.status).toBe('paused');
  await act(async () => reject(new Error('aborted'))); await advance(60000); expect(read).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('paused');
  visibility.mockReturnValue('visible'); act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(read).toHaveBeenCalledTimes(2);
});
test('offline pauses traffic and reconnect immediately reads again', async () => {
  const read = vi.fn(async (_signal: AbortSignal) => {});
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  renderHook(() => useLiveRefresh(true, 'match', read)); await advance(60000); expect(read).not.toHaveBeenCalled();
  online.mockReturnValue(true); await act(async () => window.dispatchEvent(new Event('online')));
  expect(read).toHaveBeenCalledTimes(1);
});
test('resource changes and unmount cancel pending reads and discard late completion', async () => {
  let resolve!: () => void;
  const read = vi.fn((_signal: AbortSignal) => new Promise<void>(done => { resolve = done; }));
  const { result, rerender, unmount } = renderHook(({ key }) => useLiveRefresh(true, key, read), { initialProps: { key: 'old' } });
  await advance(3000); const oldSignal = read.mock.calls[0][0];
  rerender({ key: 'new' }); expect(oldSignal.aborted).toBe(true);
  await act(async () => resolve()); expect(result.current.lastUpdated).toBeNull();
  await advance(3000); unmount(); expect(read.mock.calls[1][0].aborted).toBe(true);
  await advance(60000); expect(read).toHaveBeenCalledTimes(2);
});
test('disabled polling does not read and disabling during a request aborts it', async () => {
  const read = vi.fn((_signal: AbortSignal) => new Promise<void>(() => {}));
  const { rerender } = renderHook(({ enabled }) => useLiveRefresh(enabled, 'match', read), { initialProps: { enabled: false } });
  await advance(60000); expect(read).not.toHaveBeenCalled();
  rerender({ enabled: true }); await advance(3000); rerender({ enabled: false });
  expect(read.mock.calls[0][0].aborted).toBe(true);
});

test('hung requests time out, abort and retry rather than freezing live following forever', async () => {
  const read = vi.fn((_signal: AbortSignal) => new Promise<void>(() => {}));
  const { result } = renderHook(() => useLiveRefresh(true, 'match', read));
  await advance(3000); await advance(12000);
  expect(read.mock.calls[0][0].aborted).toBe(true);
  expect(result.current.status).toBe('retrying'); expect(result.current.error).toBe('Server nije odgovorio na vreme.');
  await advance(6000); expect(read).toHaveBeenCalledTimes(2);
});
