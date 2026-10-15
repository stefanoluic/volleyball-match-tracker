import { Alert, Badge, Button, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconRefresh, IconArrowBackUp } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage, type Match, type MatchPreparation, type MatchSet, type SetPoint, type SetScore } from '../api/client';

type Command = { kind: 'add'; requestId: string; version: number; scoringTeamId: string }
  | { kind: 'undo'; requestId: string; version: number; pointId: string }
  | { kind: 'finish'; requestId: string; version: number };

const time = (value: string) => new Intl.DateTimeFormat('sr-Latn-RS', {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(new Date(value));

export function MatchScoreboard({ match, set, canManage, onBusyChange, onSetFinished }: {
  match: Match; set: MatchSet; canManage: boolean; onBusyChange: (busy: boolean) => void;
  onSetFinished?: (result: MatchPreparation) => void;
}) {
  const [score, setScore] = useState<SetScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [pending, setPending] = useState<Command | null>(null);
  const [confirming, setConfirming] = useState<SetPoint | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    api.setScore(match.id, set.id, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setScore(result); setPending(null); setWriteError(''); setConfirming(null); setConfirmFinish(false);
      }
    }).catch((failure) => { if (!controller.signal.aborted) setLoadError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [match.id, set.id, attempt]);

  const teamName = (teamId: string) => teamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
  function refresh() {
    if (writing.current) return;
    setConfirming(null); setConfirmFinish(false); setAttempt((value) => value + 1);
  }
  async function execute(command: Command) {
    if (writing.current || loading || !canManage) return;
    writing.current = true; setBusy(true); onBusyChange(true); setWriteError('');
    try {
      if (command.kind === 'finish') {
        const result = await api.finishSet(match.id, set.id, { requestId: command.requestId, version: command.version });
        const finished = result.sets.find((entry) => entry.id === set.id);
        if (finished) setScore((current) => current && ({ ...current, version: finished.scoreVersion,
          homeScore: finished.homeScore, awayScore: finished.awayScore, setStatus: finished.status,
          matchStatus: result.roster.match.status, canRecord: false, canUndo: false, canFinish: false, winnerTeamId: finished.winnerTeamId }));
        setPending(null); setConfirmFinish(false); onSetFinished?.(result);
        notifications.show({ title: 'Set je završen', message: 'Konačan rezultat je sačuvan.', color: 'teal', role: 'status' });
        return;
      }
      const result = command.kind === 'add'
        ? await api.addPoint(match.id, set.id, {
          requestId: command.requestId, version: command.version, scoringTeamId: command.scoringTeamId,
        })
        : await api.undoPoint(match.id, set.id, command.pointId, {
          requestId: command.requestId, version: command.version,
        });
      setScore(result); setPending(null); setConfirming(null);
      if (command.kind === 'undo') notifications.show({
        title: 'Poen je poništen', message: 'Rezultat je ažuriran. Unos ostaje vidljiv u istoriji.', color: 'teal', role: 'status',
      });
    } catch (failure) {
      setWriteError(errorMessage(failure)); setConfirming(null); setConfirmFinish(false);
      // Network/5xx failures may happen after a committed write. Retrying must keep the same command ID.
      setPending(!(failure instanceof ApiError) || failure.status >= 500 ? command : null);
    } finally {
      writing.current = false; setBusy(false); onBusyChange(false);
    }
  }
  const editable = canManage && !!score && (score.canRecord || score.canUndo || score.canFinish);
  const blocked = busy || loading || !!loadError || !!writeError || !!pending || !!confirming || confirmFinish;
  function add(teamId: string) {
    if (!score?.canRecord || !editable || blocked || writing.current) return;
    void execute({ kind: 'add', requestId: crypto.randomUUID(), version: score.version, scoringTeamId: teamId });
  }

  return <Stack gap="lg" aria-busy={busy || loading}>
    <Paper component="section" withBorder p="lg" className="roster-team" aria-label={'Rezultat seta ' + set.number}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2} size="h3">Set {set.number}</Title>
          <Group gap="xs"><Badge color={score?.setStatus === 'FINISHED' ? 'gray' : 'teal'}>
            {(score?.setStatus ?? set.status) === 'LIVE' ? 'U toku' : 'Završen'}</Badge>
            <Button variant="light" size="xs" disabled={busy || loading} onClick={refresh}
              leftSection={<IconRefresh size={15} />}>Osveži rezultat</Button></Group>
        </Group>
        {loading && !score ? <Skeleton height={55} role="status" aria-label="Učitavanje rezultata" />
          : score && <Text size="xl" fw={700} ta="center" aria-live="polite" aria-atomic="true">
            {match.homeTeam.name} {score.homeScore} : {score.awayScore} {match.awayTeam.name}
          </Text>}
        <Text size="sm">Prvi servis: {teamName(set.firstServingTeamId)}</Text>
        {loadError && <Alert color="red" role="alert">{loadError}</Alert>}
        {writeError && <Alert color="red" role="alert">{writeError}
          <Text size="sm" mt="xs">{pending
            ? 'Nije potvrđeno da li je server sačuvao unos. Ponovite isti zahtev ili osvežite rezultat pre novog unosa.'
            : 'Osvežite rezultat pre sledećeg unosa.'}</Text>
          {pending && <Button variant="light" color="red" size="xs" mt="sm" disabled={busy || loading}
            onClick={() => void execute(pending)}>Ponovi isti zahtev</Button>}
        </Alert>}
        {editable && <>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Button size="md" disabled={blocked || !score.canRecord} leftSection={<IconPlus size={18} />}
              onClick={() => add(match.homeTeam.id)}>Poen za domaćina</Button>
            <Button size="md" color="teal" disabled={blocked || !score.canRecord} leftSection={<IconPlus size={18} />}
              onClick={() => add(match.awayTeam.id)}>Poen za gosta</Button>
          </SimpleGrid>
          <Group justify="flex-end"><Button variant="light" color="red" disabled={blocked || !score.canUndo}
            leftSection={<IconArrowBackUp size={17} />} onClick={() => setConfirming(score.lastActivePoint)}>
            Poništi poslednji poen
          </Button></Group>
          {confirming && <Alert color="yellow" role="alert" title="Poništavanje poena">
            Poništiti poslednji važeći poen za tim {teamName(confirming.scoringTeamId)}?
            Unos će ostati u istoriji kao poništen.
            <Group mt="sm">
              <Button variant="default" size="xs" disabled={busy} onClick={() => setConfirming(null)}>Odustani</Button>
              <Button color="red" size="xs" loading={busy} onClick={() => {
                if (!score || writing.current) return;
                void execute({ kind: 'undo', requestId: crypto.randomUUID(), version: score.version, pointId: confirming.id });
              }}>Potvrdi poništavanje</Button>
            </Group>
          </Alert>}
        </>}
        {score?.canFinish && <Alert color="teal" role="status">
          Postignut je rezultat za kraj seta. Pobednik: {teamName(score.winnerTeamId!)}.
          {canManage && <Stack mt="sm" gap="sm">
            <Text size="sm">Pre potvrde možete poništiti pogrešan završni poen. Posle potvrde korekcije ovog seta nisu dozvoljene.</Text>
            {confirmFinish ? <Group>
              <Button variant="default" size="xs" disabled={busy} onClick={() => setConfirmFinish(false)}>Odustani od završavanja</Button>
              <Button color="teal" size="xs" loading={busy} onClick={() => {
                if (writing.current) return;
                void execute({ kind: 'finish', requestId: crypto.randomUUID(), version: score.version });
              }}>Potvrdi kraj seta</Button>
            </Group> : <Button w="fit-content" color="teal" disabled={blocked} onClick={() => setConfirmFinish(true)}>Završi set</Button>}
          </Stack>}
        </Alert>}
        {score && !editable && <Text size="sm" c="dimmed">{canManage
          ? 'Unos nije dostupan jer utakmica ili set nisu u toku.' : 'Pristup za pregled. Rezultat osvežavate ručno.'}</Text>}
        <Text size="xs" c="dimmed">Za sada beležimo samo tim kome ide poen. Kraj seta potvrđuje statističar; rotacija još nije implementirana.</Text>
      </Stack>
    </Paper>
    <Paper component="section" aria-label="Poslednji poeni" withBorder p="lg" className="roster-team">
      <Stack gap="md">
        <Group justify="space-between"><Title order={2} size="h4">Poslednji poeni</Title>
          <Text size="xs" c="dimmed">Poslednjih 20 unosa · najnoviji prvi</Text></Group>
        {score?.points.length === 0 && <Text size="sm" c="dimmed">Još nema unetih poena.</Text>}
        {score?.points.map((point) => <div key={point.id} className="roster-player">
          <Group justify="space-between">
            <div><Text size="sm" fw={600}>#{point.sequenceNumber} · Poen za {teamName(point.scoringTeamId)}</Text>
              <Text size="xs" c="dimmed">{time(point.createdAt)} · Rezultat posle unosa: {point.homeScoreAfter}:{point.awayScoreAfter}</Text></div>
            {point.cancelledAt && <Badge color="red" variant="light">Poništen</Badge>}
          </Group>
          {point.cancelledAt && <Text size="xs" c="dimmed" mt={5}>Poništen u {time(point.cancelledAt)} · ne ulazi u trenutni rezultat</Text>}
        </div>)}
      </Stack>
    </Paper>
  </Stack>;
}
