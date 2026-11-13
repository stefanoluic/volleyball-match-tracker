import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage, type Match, type MatchPreparation, type MatchSet, type SetPoint, type SetScore } from '../api/client';
import { executeMatchCommand, type MatchCommand } from './commands';
import { useLiveRefresh } from './useLiveRefresh';

const notices = {
  undo: { title: 'Poen je poništen', message: 'Rezultat je ažuriran. Unos ostaje vidljiv u istoriji.', color: 'teal' },
  substitute: { title: 'Izmena je sačuvana', message: 'Raspored igrača je ažuriran.', color: 'teal' },
  undoSubstitution: { title: 'Izmena je poništena', message: 'Raspored igrača je ažuriran.', color: 'teal' },
  libero: { title: 'Zamena libera je sačuvana', message: 'Raspored igrača je ažuriran.', color: 'violet' },
  undoLibero: { title: 'Zamena libera je poništena', message: 'Raspored igrača je ažuriran.', color: 'violet' },
  finish: { title: 'Set je završen', message: 'Konačan rezultat je sačuvan.', color: 'teal' },
};

export function useMatchScore(match: Match, set: MatchSet, canManage: boolean,
  onSetFinished?: (result: MatchPreparation) => void) {
  const [score, setScore] = useState<SetScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [pending, setPending] = useState<MatchCommand | null>(null);
  const [confirming, setConfirming] = useState<SetPoint | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    api.setScore(match.id, set.id, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setScore(result);
        setPending(null);
        setWriteError('');
        setConfirming(null);
        setConfirmFinish(false);
      }
    }).catch((failure) => {
      if (!controller.signal.aborted) setLoadError(errorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [match.id, set.id, attempt]);

  const liveEnabled = !canManage && !loading && match.status === 'LIVE' && (score?.setStatus ?? set.status) === 'LIVE';
  const live = useLiveRefresh(liveEnabled, match.id + ':' + set.id + ':' + attempt, async (signal) => {
    const result = await api.setScore(match.id, set.id, signal);
    if (signal.aborted) return;
    setScore((previous) => previous && previous.version > result.version ? previous : result);
    setLoadError('');
  });

  function refresh() {
    if (writing.current) return;
    setConfirming(null);
    setConfirmFinish(false);
    setAttempt((value) => value + 1);
  }

  async function execute(command: MatchCommand) {
    if (writing.current || loading || !canManage) return;
    writing.current = true;
    setBusy(true);
    setWriteError('');
    try {
      const outcome = await executeMatchCommand(match.id, set.id, command);
      if (outcome.kind === 'finish') {
        const result = outcome.preparation;
        setScore((current) => completedScore(current, result, set.id));
        setPending(null);
        setConfirmFinish(false);
        onSetFinished?.(result);
      } else {
        setScore(outcome.score);
        setPending(null);
        setConfirming(null);
      }
      if (command.kind !== 'add') notifications.show({ ...notices[command.kind], role: 'status' });
    } catch (failure) {
      setWriteError(errorMessage(failure));
      setConfirming(null);
      setConfirmFinish(false);
      // A network/5xx failure may follow a committed write. Keep the exact command for an explicit retry.
      setPending(!(failure instanceof ApiError) || failure.status >= 500 ? command : null);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  return { score, loading, loadError, writeError, busy, pending, confirming, setConfirming,
    confirmFinish, setConfirmFinish, liveEnabled, live, refresh, execute };
}

function completedScore(current: SetScore | null, result: MatchPreparation, setId: string): SetScore | null {
  const finished = result.sets.find((entry) => entry.id === setId);
  if (!current || !finished) return current;
  return { ...current, version: finished.scoreVersion, homeScore: finished.homeScore, awayScore: finished.awayScore,
    setStatus: finished.status, matchStatus: result.roster.match.status,
    canRecord: false, canUndo: false, canFinish: false, winnerTeamId: finished.winnerTeamId,
    court: current.court && { ...current.court, servingTeamId: null, server: null } };
}
