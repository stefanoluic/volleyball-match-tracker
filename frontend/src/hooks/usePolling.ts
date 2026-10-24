import { useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage, READ_TIMEOUT_MS } from '../api/client';

export const DEFAULT_POLLING_INTERVAL = 3_000;
export interface PollingState {
  status: 'waiting' | 'refreshing' | 'paused' | 'retrying' | 'stopped';
  error: string;
  lastUpdated: number | null;
  retryDelay: number;
}
interface PollingOptions {
  intervalMs?: number;
  maxRetryDelayMs?: number;
  immediate?: boolean;
}

// Only GET callbacks belong here. Mutations keep their explicit idempotent retry workflow.
export function usePolling(enabled: boolean, resourceKey: string, refresh: (signal: AbortSignal) => Promise<void>,
  { intervalMs = DEFAULT_POLLING_INTERVAL, maxRetryDelayMs = 30_000, immediate = false }: PollingOptions = {}) {
  const callback = useRef(refresh);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  const [state, setState] = useState<PollingState>({ status: 'waiting', error: '', lastUpdated: null, retryDelay: 0 });
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let terminal = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: AbortController | undefined;
    const paused = () => document.visibilityState === 'hidden' || navigator.onLine === false;
    const cancel = () => { clearTimeout(timer); current?.abort(); current = undefined; };
    const schedule = (delay: number) => { if (!disposed && !terminal && !paused()) timer = setTimeout(run, delay); };
    async function run() {
      if (disposed || terminal || paused() || current) return;
      const controller = new AbortController(); current = controller;
      let timedOut = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let abortWait: (() => void) | undefined;
      setState((value) => ({ ...value, status: 'refreshing' }));
      let delay = intervalMs;
      try {
        await Promise.race([callback.current(controller.signal), new Promise<never>((_resolve, reject) => {
          abortWait = () => { clearTimeout(timeout); reject(new DOMException('Read cancelled', 'AbortError')); };
          controller.signal.addEventListener('abort', abortWait, { once: true });
          timeout = setTimeout(() => {
            timedOut = true;
            reject(new ApiError('Server nije odgovorio na vreme.', 504));
            controller.abort();
          }, READ_TIMEOUT_MS);
        })]);
        if (disposed || controller.signal.aborted) return;
        failures = 0;
        setState({ status: 'waiting', error: '', lastUpdated: Date.now(), retryDelay: 0 });
      } catch (failure) {
        if (disposed || (controller.signal.aborted && !timedOut)) return;
        terminal = failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 429;
        failures++;
        delay = Math.min(maxRetryDelayMs, intervalMs * 2 ** Math.min(failures, 4));
        setState((value) => ({ ...value, status: terminal ? 'stopped' : 'retrying',
          error: errorMessage(failure), retryDelay: terminal ? 0 : delay }));
      } finally {
        clearTimeout(timeout);
        if (abortWait) controller.signal.removeEventListener('abort', abortWait);
        if (current === controller) current = undefined;
      }
      if (!controller.signal.aborted || timedOut) schedule(delay);
    }
    function resumeOrPause() {
      if (terminal || disposed) return;
      cancel();
      if (paused()) setState((value) => ({ ...value, status: 'paused' }));
      else void run();
    }
    setState({ status: paused() ? 'paused' : 'waiting', error: '', lastUpdated: null, retryDelay: 0 });
    document.addEventListener('visibilitychange', resumeOrPause);
    window.addEventListener('online', resumeOrPause);
    window.addEventListener('offline', resumeOrPause);
    schedule(immediate ? 0 : intervalMs);
    return () => {
      disposed = true; cancel();
      document.removeEventListener('visibilitychange', resumeOrPause);
      window.removeEventListener('online', resumeOrPause);
      window.removeEventListener('offline', resumeOrPause);
    };
  }, [enabled, resourceKey, intervalMs, maxRetryDelayMs, immediate]);
  return state;
}
