import { Alert, Badge, Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState, type FormEvent } from 'react';
import type { Match, MatchPlayer, SetScore } from '../api/client';
import type { LiberoCommand } from './commands';

const label = (player: MatchPlayer) => '#' + player.jerseyNumber + ' ' + player.firstName + ' ' + player.lastName;

export function LiberoReplacements({ match, score, canManage, disabled, busy, onCommand, onEditingChange }: {
  match: Match; score: SetScore; canManage: boolean; disabled: boolean; busy: boolean;
  onCommand: (command: LiberoCommand) => void; onEditingChange: (editing: boolean) => void;
}) {
  const [mode, setMode] = useState<'replace' | 'undo' | null>(null);
  const [outgoingId, setOutgoingId] = useState('');
  const [incomingId, setIncomingId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setMode(null); setOutgoingId(''); setIncomingId(''); setConfirming(false); setError(''); }, [score.version]);
  useEffect(() => { onEditingChange(mode !== null); }, [mode, onEditingChange]);
  useEffect(() => () => onEditingChange(false), [onEditingChange]);
  const state = score.libero;
  if (!state) return null;
  const option = state.options.find((entry) => entry.outgoing.id === outgoingId);
  const incoming = option?.incoming.find((player) => player.id === incomingId);
  const editable = canManage && score.matchStatus === 'LIVE' && score.setStatus === 'LIVE';
  const teamName = (id: string) => id === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
  function cancel() { setMode(null); setConfirming(false); setOutgoingId(''); setIncomingId(''); setError(''); }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (!option || !incoming) { setError('Izaberite dozvoljeni par igrača za zamenu libera.'); return; }
    setError(''); setConfirming(true);
  }
  return <Paper component="section" aria-label="Zamene libera" withBorder p="lg" className="roster-team">
    <Stack gap="md">
      <Group justify="space-between"><Title order={2} size="h3">Libero</Title><Badge color="violet" variant="light">Ne troši obične izmene</Badge></Group>
      <Text size="sm" c="dimmed">Po jedan libero po timu na terenu, samo u zadnjoj liniji i bez servisa.
        Između dve zamene libera istog tima mora biti odigran poen. Izuzetni slučajevi i ponovno određivanje libera nisu podržani.</Text>
      {state.mustExit && <Alert color="orange" role="alert" title="Obavezan izlazak libera">
        Pre narednog poena vratite zamenjenog igrača. Libero je rotacijom došao u prednju liniju ili na servis.
      </Alert>}
      {state.active.length === 0 && <Text size="sm" c="dimmed">Nema libera u prikazanim šestorkama.</Text>}
      {state.active.map((entry) => <Text key={entry.teamId} size="sm" fw={600}>
        {teamName(entry.teamId)}: libero {label(entry.libero)} umesto {label(entry.regular)} · pozicija {entry.rotationPosition}
      </Text>)}
      {editable && mode === null && <Group>
        <Button variant="light" color="violet" disabled={disabled || state.options.length === 0}
          onClick={() => setMode('replace')}>Ulazak / izlazak libera</Button>
        <Button variant="light" color="red" disabled={disabled || !state.undoableId}
          onClick={() => setMode('undo')}>Poništi zamenu libera</Button>
      </Group>}
      {editable && mode === 'replace' && <form aria-label="Zamena libera" onSubmit={prepare} noValidate>
        <Stack gap="md">
          <Select label="Igrač koji izlazi zbog zamene libera" required searchable clearable value={outgoingId || null}
            disabled={disabled || confirming} placeholder="Izaberite dozvoljenog igrača"
            data={state.options.map((entry) => ({ value: entry.outgoing.id, label: teamName(entry.teamId) + ' · ' + label(entry.outgoing) }))}
            onChange={(id) => { setOutgoingId(id ?? ''); setIncomingId(''); setError(''); }} />
          <Select label="Igrač koji ulazi zbog zamene libera" required searchable clearable value={incomingId || null}
            disabled={disabled || confirming || !option} placeholder="Libero ili zamenjeni igrač"
            data={option?.incoming.map((player) => ({ value: player.id, label: label(player) })) ?? []}
            onChange={(id) => { setIncomingId(id ?? ''); setError(''); }} />
          {error && <Alert color="red" role="alert">{error}</Alert>}
          {confirming && option && incoming ? <Alert color="yellow" role="alert" title="Potvrda zamene libera">
            {teamName(option.teamId)}: izlazi {label(option.outgoing)}, ulazi {label(incoming)}. Rezultat i broj običnih izmena ostaju isti.
            <Group mt="sm"><Button size="xs" variant="default" disabled={disabled} onClick={() => setConfirming(false)}>Promeni par libera</Button>
              <Button size="xs" color="violet" loading={busy} disabled={disabled && !busy} onClick={() => {
                if (disabled) return;
                onCommand({ kind: 'libero', requestId: crypto.randomUUID(), version: score.version,
                  outgoingParticipantId: outgoingId, incomingParticipantId: incomingId });
              }}>Potvrdi zamenu libera</Button></Group>
          </Alert> : <Button type="submit" w="fit-content" color="violet" disabled={disabled}>Pregledaj zamenu libera</Button>}
          <Button variant="default" w="fit-content" disabled={busy} onClick={cancel}>Odustani od zamene libera</Button>
        </Stack>
      </form>}
      {editable && mode === 'undo' && <Alert color="yellow" role="alert" title="Ispravka unosa libera">
        Poništiti poslednju važeću zamenu libera? Prethodni raspored će biti vraćen; zapis ostaje u istoriji.
        Za stvarni izlazak libera koristite novu zamenu, ne ovo poništavanje.
        <Group mt="sm"><Button variant="default" size="xs" disabled={busy} onClick={cancel}>Odustani od ispravke libera</Button>
          <Button size="xs" color="red" loading={busy} disabled={disabled && !busy} onClick={() => {
            if (disabled || !state.undoableId) return;
            onCommand({ kind: 'undoLibero', requestId: crypto.randomUUID(), version: score.version, replacementId: state.undoableId });
          }}>Potvrdi poništavanje zamene libera</Button></Group>
      </Alert>}
      {state.history.length === 0 && <Text size="sm" c="dimmed">Još nema zabeleženih zamena libera.</Text>}
      {state.history.length > 0 && <Text size="xs" c="dimmed">Poslednjih 20 zamena libera · najnovija prva</Text>}
      {state.history.map((entry) => <div key={entry.id} className="roster-player">
        <Group justify="space-between"><Text size="sm" fw={600}>{teamName(entry.teamId)} · {label(entry.outgoing)} → {label(entry.incoming)}</Text>
          {entry.cancelledAt && <Badge color="red" variant="light">Poništena zamena libera</Badge>}</Group>
        <Text size="xs" c="dimmed">Pri rezultatu {entry.homeScore}:{entry.awayScore} · {new Date(entry.createdAt).toLocaleTimeString('sr-Latn-RS')}</Text>
      </div>)}
    </Stack>
  </Paper>;
}
