import { useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';

export const LIVE_REFRESH_INTERVAL = 3_000;
const MAX_RETRY_DELAY = 30_000;
const REQUEST_TIMEOUT = 12_000;
export interface LiveRefreshState {
  status: 'waiting' | 'refreshing' | 'paused' | 'retrying' | 'stopped';
  error: string;
  lastUpdated: number | null;
  retryDelay: number;
}

// Only GET callbacks belong here. Mutations keep their explicit idempotent retry workflow.
export function useLiveRefresh(enabled: boolean, resourceKey: string, refresh: (signal: AbortSignal) => Promise<void>) {
  const callback = useRef(refresh);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  const [state, setState] = useState<LiveRefreshState>({ status: 'waiting', error: '', lastUpdated: null, retryDelay: 0 });
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
      let delay = LIVE_REFRESH_INTERVAL;
      try {
        await Promise.race([callback.current(controller.signal), new Promise<never>((_resolve, reject) => {
          abortWait = () => { clearTimeout(timeout); reject(new DOMException('Read cancelled', 'AbortError')); };
          controller.signal.addEventListener('abort', abortWait, { once: true });
          timeout = setTimeout(() => {
            timedOut = true;
            reject(new ApiError('Server nije odgovorio na vreme.', 504));
            controller.abort();
          }, REQUEST_TIMEOUT);
        })]);
        if (disposed || controller.signal.aborted) return;
        failures = 0;
        setState({ status: 'waiting', error: '', lastUpdated: Date.now(), retryDelay: 0 });
      } catch (failure) {
        if (disposed || (controller.signal.aborted && !timedOut)) return;
        terminal = failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 429;
        failures++;
        delay = Math.min(MAX_RETRY_DELAY, LIVE_REFRESH_INTERVAL * 2 ** Math.min(failures, 4));
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
    schedule(LIVE_REFRESH_INTERVAL);
    return () => {
      disposed = true; cancel();
      document.removeEventListener('visibilitychange', resumeOrPause);
      window.removeEventListener('online', resumeOrPause);
      window.removeEventListener('offline', resumeOrPause);
    };
  }, [enabled, resourceKey]);
  return state;
}
