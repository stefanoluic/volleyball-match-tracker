import { Alert, Badge, Button, Group, Paper, Select, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconPlayerPlay, IconRefresh, IconBallVolleyball } from '@tabler/icons-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, type LineupPlayer, type MatchPreparation, type StartMatchInput, type TeamRoster } from '../api/client';
import { EditorPage } from '../components/EditorPage';
import { positionLabels } from '../players/validation';
import { formatMatchTime, matchStatusLabels } from './validation';
import { hasStartDraft, initialStartInput, rotationLabels, validateStartInput } from './lineup';
import { MatchScoreboard } from './MatchScoreboard';

function TeamLineup({ team, ids, disabled, error, onChange }: {
  team: TeamRoster; ids: string[]; disabled: boolean; error?: string; onChange: (ids: string[]) => void;
}) {
  const eligible = team.selected.filter((p) => !p.isLibero);
  return <Paper component="section" aria-label={'Postava: ' + team.team.name} withBorder p="lg" className="roster-team">
    <Stack gap="md">
      <Group justify="space-between"><Title order={2} size="h4">{team.team.name}</Title>
        <Badge color="teal">{ids.filter(Boolean).length}/6</Badge></Group>
      <Text size="xs" c="dimmed">Birate iz sačuvanog sastava, bez prijavljenih libera.</Text>
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {eligible.length < 6 && <Alert color="blue">Potrebno je najmanje šest prijavljenih igrača koji nisu liberi.
        Najpre dopunite i sačuvajte sastav utakmice.</Alert>}
      {rotationLabels.map((label, index) => <Select key={index} required searchable clearable
        label={'Pozicija ' + label} aria-label={team.team.name + ' · pozicija ' + (index + 1)}
        placeholder="Izaberite igrača" value={ids[index] || null} disabled={disabled || eligible.length < 6}
        nothingFoundMessage="Nema dostupnih igrača" styles={{ input: { color: 'var(--mantine-color-text)' } }}
        data={eligible.map((player) => ({
          value: player.id,
          label: '#' + player.jerseyNumber + ' ' + player.firstName + ' ' + player.lastName + ' · ' + positionLabels[player.position],
          disabled: ids.some((id, other) => other !== index && id === player.id),
        }))}
        onChange={(id) => onChange(ids.map((current, other) => index === other ? id ?? '' : current))} />)}
      <Text size="xs" c="dimmed">Pozicije su mesta u rotaciji, ne taktičke uloge. Tim koji prvi servira počinje igračem na poziciji 1; protivnik pri osvajanju servisa prvo rotira.</Text>
    </Stack>
  </Paper>;
}

function SavedLineup({ team, rows }: { team: TeamRoster; rows: LineupPlayer[] }) {
  return <Paper component="section" aria-label={'Sačuvana postava: ' + team.team.name} withBorder p="lg" className="roster-team">
    <Stack gap="md">
      <Title order={2} size="h4">{team.team.name}</Title>
      {rows.map(({ rotationPosition, participant: player }) => <div key={rotationPosition} className="roster-player">
        <Text size="xs" c="dimmed">Početna pozicija {rotationLabels[rotationPosition - 1]}</Text>
        <Text fw={600}>#{player.jerseyNumber} {player.firstName} {player.lastName}</Text>
        <Text size="xs" c="dimmed">{positionLabels[player.position]}</Text>
      </div>)}
    </Stack>
  </Paper>;
}

export function MatchPreparationPage({ matchId, canManage, onBack }: {
  matchId: string; canManage: boolean; onBack: () => void;
}) {
  const [data, setData] = useState<MatchPreparation | null>(null);
  const [input, setInput] = useState<StartMatchInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [startError, setStartError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [scoringBusy, setScoringBusy] = useState(false);
  const [preparingNext, setPreparingNext] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [navigation, setNavigation] = useState<'back' | 'reload' | 'overview' | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setStartError(''); setFields({}); setConfirming(false);
    api.matchPreparation(matchId, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setData(result); setInput(initialStartInput(result)); setPreparingNext(false);
        setSelectedSetId(result.currentSet?.id ?? result.sets.at(-1)?.id ?? null);
      }
    }).catch((failure) => { if (!controller.signal.aborted) setLoadError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [matchId, attempt]);

  const editable = !!data && canManage && ((data.roster.match.status === 'SCHEDULED' && !data.firstSet)
    || (preparingNext && data.roster.match.status === 'LIVE' && !!data.nextSetNumber));
  const dirty = editable && !!input && !!data && hasStartDraft(input, initialStartInput(data).firstServingTeamId);
  function navigate(destination: 'back' | 'reload' | 'overview') {
    if (busy || scoringBusy) return;
    setConfirming(false);
    if (dirty) setNavigation(destination);
    else if (destination === 'back') onBack();
    else if (destination === 'overview') setPreparingNext(false);
    else setAttempt((value) => value + 1);
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || !data || !input || busy || navigation) return;
    const errors = validateStartInput(data.roster, input);
    setFields(errors); setStartError('');
    if (!Object.keys(errors).length) setConfirming(true);
  }
  async function start() {
    if (!editable || !data || !input || busy || !confirming) return;
    const errors = validateStartInput(data.roster, input);
    if (Object.keys(errors).length) { setFields(errors); setConfirming(false); return; }
    setBusy(true); setStartError('');
    try {
      const previous = data.sets.at(-1);
      const result = preparingNext && data.nextSetNumber && previous
        ? await api.startNextSet(matchId, { ...input, number: data.nextSetNumber,
          previousSetId: previous.id, previousSetVersion: previous.scoreVersion })
        : await api.startMatch(matchId, input);
      setData(result); setInput(initialStartInput(result)); setConfirming(false);
      setPreparingNext(false); setSelectedSetId(result.currentSet?.id ?? null);
      notifications.show({ title: preparingNext ? 'Set je počeo' : 'Utakmica je počela', message: 'Početne postave su sačuvane.',
        color: 'teal', role: 'status' });
    } catch (failure) { setStartError(errorMessage(failure)); setConfirming(false); }
    finally { setBusy(false); }
  }
  if (loading || loadError || !data || !input) return <Stack gap="lg">
    <Button variant="subtle" w="fit-content" leftSection={<IconArrowLeft size={17} />} onClick={onBack}>Nazad na utakmice</Button>
    <Title order={1} size="h2">Početne postave</Title>
    {loading ? <Stack role="status" aria-label="Učitavanje postava"><Skeleton height={130} /><Skeleton height={280} /></Stack>
      : <Alert color="red" role="alert">{loadError || 'Podaci nisu dostupni.'}
        <Button variant="light" mt="sm" onClick={() => setAttempt((value) => value + 1)}>Pokušaj ponovo</Button>
      </Alert>}
  </Stack>;

  const { roster, firstSet } = data;
  const match = roster.match;
  const selectedSet = data.sets.find((entry) => entry.id === selectedSetId) ?? data.currentSet ?? data.sets.at(-1);
  const nextNumber = preparingNext ? data.nextSetNumber : null;
  const title = nextNumber ? 'Početne postave · set ' + nextNumber : firstSet ? 'Pregled utakmice' : 'Početne postave';
  const blocked = busy || confirming || !!navigation;
  const ready = roster.home.selected.filter((p) => !p.isLibero).length >= 6
    && roster.away.selected.filter((p) => !p.isLibero).length >= 6;
  const change = (next: StartMatchInput) => { setInput(next); setFields({}); setStartError(''); };
  return <EditorPage key={title} title={title} category={match.homeTeam.name + ' — ' + match.awayTeam.name}
    description={formatMatchTime(match.scheduledAt) + ' · ' + matchStatusLabels[match.status]}
    icon={<IconBallVolleyball size={28} aria-hidden="true" />} busy={busy || scoringBusy}
    breadcrumbs={[{ label: 'Utakmice', onClick: () => navigate('back') }]}>
    <Stack gap="xl">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{nextNumber ? 'Priprema seta ' + nextNumber : firstSet ? 'Rezultat u setovima i pregled igre' : 'Prvi set · početna šestorka i redosled rotacije'}</Text>
        <Button variant="light" size="xs" disabled={busy || scoringBusy} leftSection={<IconRefresh size={15} />}
          onClick={() => navigate('reload')}>Učitaj trenutno stanje</Button>
      </Group>
      {startError && <Alert color="red" role="alert">{startError}</Alert>}
      {navigation && <Alert color="yellow" role="alert" title="Nesačuvane postave">
        Izbor postava još nije sačuvan. Želite li da ga odbacite?
        <Group mt="sm"><Button size="xs" variant="default" onClick={() => setNavigation(null)}>Nastavi uređivanje</Button>
          <Button size="xs" color="yellow" onClick={() => {
            const destination = navigation; setNavigation(null);
            if (destination === 'back') onBack();
            else if (destination === 'overview') setPreparingNext(false);
            else setAttempt((value) => value + 1);
          }}>Odbaci izmene</Button></Group>
      </Alert>}
      {firstSet && !preparingNext ? <>
        <Paper component="section" withBorder p="lg" className="roster-team" aria-label="Rezultat utakmice">
          <Stack gap="md">
            <Group justify="space-between"><Title order={2} size="h3">Rezultat u setovima</Title>
              <Badge color={match.status === 'FINISHED' ? 'gray' : 'teal'}>{matchStatusLabels[match.status]}</Badge></Group>
            <Text size="xl" fw={700} ta="center">{match.homeTeam.name} {data.homeSetsWon} : {data.awaySetsWon} {match.awayTeam.name} · setovi</Text>
            {match.status === 'FINISHED' && <Alert color="teal" role="status">
              Utakmica je završena. Pobednik: {data.homeSetsWon === 3 ? match.homeTeam.name : match.awayTeam.name}.
            </Alert>}
            <Group gap="xs">{data.sets.map((entry) => <Badge key={entry.id} variant="light" color={entry.status === 'LIVE' ? 'teal' : 'blue'}>
              Set {entry.number}: {entry.status === 'FINISHED' ? entry.homeScore + ':' + entry.awayScore : 'U toku'}
            </Badge>)}</Group>
            {canManage && data.nextSetNumber && <Button color="teal" w="fit-content" disabled={busy || scoringBusy}
              onClick={() => { setInput(initialStartInput(data)); setPreparingNext(true); setFields({}); setStartError(''); setConfirming(false); }}>
              Pripremi set {data.nextSetNumber}
            </Button>}
            {!canManage && data.nextSetNumber && <Text size="sm" c="dimmed">Čeka se da statističar pokrene set {data.nextSetNumber}.</Text>}
          </Stack>
        </Paper>
        <Select label="Set za pregled" disabled={scoringBusy} value={selectedSet?.id ?? null}
          data={data.sets.map((entry) => ({ value: entry.id, label: 'Set ' + entry.number + ' · '
            + (entry.status === 'LIVE' ? 'U toku' : entry.homeScore + ':' + entry.awayScore + ' · Završen') }))}
          onChange={(id) => setSelectedSetId(id)} />
        {selectedSet && <>
        <MatchScoreboard key={selectedSet.id + ':' + selectedSet.status} match={match} set={selectedSet}
          canManage={canManage} onBusyChange={setScoringBusy} onSetFinished={(result) => {
            setData(result); setInput(initialStartInput(result)); setSelectedSetId(result.currentSet?.id ?? result.sets.at(-1)?.id ?? null);
          }} />
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <SavedLineup team={roster.home} rows={selectedSet.homeLineup} />
          <SavedLineup team={roster.away} rows={selectedSet.awayLineup} />
        </SimpleGrid>
        </>}
        <Alert color="blue">Prikazane su početne postave. Izmene igrača, ulasci libera i automatska rotacija još nisu implementirani.</Alert>
      </> : editable ? <form aria-label={nextNumber ? 'Priprema seta ' + nextNumber : 'Priprema prvog seta'} onSubmit={prepare} noValidate>
        <Stack gap="xl">
          <Alert color="blue">{nextNumber ? 'Izaberite početnu šestorku za naredni set iz prijavljenih učesnika.' : 'Najpre sačuvajte učesnike preko „Prikaži sastave“. Ovde ih raspoređujete za prvi set.'}
            Libero ulazi naknadno; ne bira se u početnu šestorku.</Alert>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <TeamLineup team={roster.home} ids={input.homeLineup} disabled={blocked} error={fields.homeLineup}
              onChange={(homeLineup) => change({ ...input, homeLineup })} />
            <TeamLineup team={roster.away} ids={input.awayLineup} disabled={blocked} error={fields.awayLineup}
              onChange={(awayLineup) => change({ ...input, awayLineup })} />
          </SimpleGrid>
          <Select label="Tim koji prvi servira" required clearable value={input.firstServingTeamId || null}
            data={[{ value: match.homeTeam.id, label: match.homeTeam.name }, { value: match.awayTeam.id, label: match.awayTeam.name }]}
            disabled={blocked || (!!nextNumber && nextNumber < 5)} error={fields.firstServingTeamId} placeholder="Izaberite tim prema ishodu žreba"
            onChange={(id) => change({ ...input, firstServingTeamId: id ?? '' })} />
          {nextNumber && <Text size="xs" c="dimmed">{nextNumber === 5
            ? 'Za peti set ponavlja se žreb; unesite tim koji prvi servira.'
            : 'Prvi servis se automatski menja u odnosu na prethodni set.'}</Text>}
          {confirming ? <Alert color="yellow" title={nextNumber ? 'Pokretanje seta ' + nextNumber : 'Pokretanje utakmice'} role="alert">
            {nextNumber ? 'Sačuvaće se obe šestorke i pokrenuti novi set sa rezultatom 0:0.' : 'Sačuvaće se obe šestorke i prvi servis. Utakmica će preći u „U toku“, a sastavi više neće moći da se uređuju.'}
            U ovoj verziji ne postoji vraćanje utakmice u „Zakazana“.
            <Group mt="sm"><Button variant="default" disabled={busy} onClick={() => setConfirming(false)}>Nastavi pripremu</Button>
              <Button color="teal" loading={busy} onClick={start}>{nextNumber ? 'Potvrdi početak seta' : 'Potvrdi početak'}</Button></Group>
          </Alert> : <Group justify="flex-end">
            {nextNumber && <Button variant="default" onClick={() => navigate('overview')}>Odustani od pripreme</Button>}
            <Button type="submit" color="teal" disabled={!ready || !!navigation} leftSection={<IconPlayerPlay size={17} />}>
              {nextNumber ? 'Počni set ' + nextNumber : 'Počni utakmicu'}
            </Button>
          </Group>}
          <Text size="xs" c="dimmed">Izbor se čuva tek pri potvrdi početka utakmice.</Text>
        </Stack>
      </form> : <Alert color="blue">Početne postave još nisu sačuvane. Statističar ih bira pri pokretanju utakmice.</Alert>}
      <Group justify="flex-end" className="editor-actions">
        <Button variant="default" disabled={busy || scoringBusy} onClick={() => navigate('back')}>Nazad na utakmice</Button>
      </Group>
    </Stack>
  </EditorPage>;
}
