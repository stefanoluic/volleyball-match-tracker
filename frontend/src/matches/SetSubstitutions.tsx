import { Alert, Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState, type FormEvent } from 'react';
import type { Match, MatchPlayer, SetScore } from '../api/client';
import type { SubstitutionCommand } from './commands';

const label = (player: MatchPlayer) => '#' + player.jerseyNumber + ' ' + player.firstName + ' ' + player.lastName;

export function SetSubstitutions({ match, score, canManage, disabled, busy, onCommand, onEditingChange }: {
  match: Match; score: SetScore; canManage: boolean; disabled: boolean; busy: boolean;
  onCommand: (command: SubstitutionCommand) => void; onEditingChange: (editing: boolean) => void;
}) {
  const [mode, setMode] = useState<'add' | 'undo' | null>(null);
  const [teamId, setTeamId] = useState(match.homeTeam.id);
  const [outgoingId, setOutgoingId] = useState('');
  const [incomingId, setIncomingId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setMode(null); setOutgoingId(''); setIncomingId(''); setConfirming(false); setError(''); }, [score.version]);
  useEffect(() => { onEditingChange(mode !== null); }, [mode, onEditingChange]);
  useEffect(() => () => onEditingChange(false), [onEditingChange]);
  const state = score.substitutions;
  if (!state) return null;
  const options = state.options.filter((row) => row.teamId === teamId);
  const selected = options.find((row) => row.outgoing.id === outgoingId);
  const incoming = selected?.incoming.find((player) => player.id === incomingId);
  const undoable = state.history.find((row) => row.id === state.undoableId);
  const editable = canManage && score.matchStatus === 'LIVE' && score.setStatus === 'LIVE';
  function cancel() { setMode(null); setConfirming(false); setError(''); setOutgoingId(''); setIncomingId(''); }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (!selected || !incoming) { setError('Izaberite igrača koji izlazi i dozvoljenog igrača koji ulazi.'); return; }
    setError(''); setConfirming(true);
  }
  const teamName = (id: string) => id === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
  return <Paper component="section" aria-label="Izmene igrača" withBorder p="lg" className="roster-team">
    <Stack gap="md">
      <Title order={2} size="h3">Izmene igrača</Title>
      <Group gap="sm"><Badge variant="light" color="blue">{match.homeTeam.name}: {state.homeUsed}/6</Badge>
        <Badge variant="light" color="teal">{match.awayTeam.name}: {state.awayUsed}/6</Badge></Group>
      <Text size="sm" c="dimmed">Početni igrač može jednom izaći i jednom se vratiti umesto iste zamene.
        U ovoj verziji unosite jednu izmenu po timu između dva poena; grupne izmene nisu podržane. Zamene libera vode se odvojeno.</Text>
      {state.pointUndoBlocked && <Alert color="blue">Pre poništavanja poslednjeg poena prvo poništite kasniju promenu postave.</Alert>}
      {editable && mode === null && <Group>
        <Button variant="light" disabled={disabled || !score.canRecord || state.options.length === 0}
          onClick={() => setMode('add')}>Unesi izmenu</Button>
        <Button variant="light" color="red" disabled={disabled || !state.undoableId}
          onClick={() => setMode('undo')}>Poništi poslednju izmenu</Button>
      </Group>}
      {editable && mode === 'add' && <form aria-label="Nova izmena" onSubmit={prepare} noValidate>
        <Stack gap="md">
          <Select label="Tim za izmenu" value={teamId} disabled={disabled || confirming} allowDeselect={false}
            data={[{ value: match.homeTeam.id, label: match.homeTeam.name }, { value: match.awayTeam.id, label: match.awayTeam.name }]}
            onChange={(id) => { if (id) setTeamId(id); setOutgoingId(''); setIncomingId(''); setError(''); }} />
          {options.length === 0 && <Alert color="blue">Trenutno nema dozvoljenih izmena za izabrani tim. Proverite broj izmena, raspoložive zamene i da li je odigran naredni poen.</Alert>}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select label="Igrač koji izlazi" required searchable clearable value={outgoingId || null}
              placeholder="Izaberite igrača iz šestorke" disabled={disabled || confirming || options.length === 0}
              data={options.map((row) => ({ value: row.outgoing.id, label: label(row.outgoing) }))}
              onChange={(id) => { setOutgoingId(id ?? ''); setIncomingId(''); setError(''); }} />
            <Select label="Igrač koji ulazi" required searchable clearable value={incomingId || null}
              placeholder="Izaberite dozvoljenu zamenu" disabled={disabled || confirming || !selected}
              data={selected?.incoming.map((player) => ({ value: player.id, label: label(player) })) ?? []}
              onChange={(id) => { setIncomingId(id ?? ''); setError(''); }} />
          </SimpleGrid>
          {error && <Alert color="red" role="alert">{error}</Alert>}
          {confirming && selected && incoming ? <Alert color="yellow" role="alert" title="Potvrda izmene">
            {teamName(teamId)}: izlazi {label(selected.outgoing)}, ulazi {label(incoming)}.
            Rezultat ostaje {score.homeScore}:{score.awayScore}. Igrač koji ulazi preuzima isto mesto u rotaciji.
            <Group mt="sm"><Button variant="default" size="xs" disabled={disabled} onClick={() => setConfirming(false)}>Promeni izbor</Button>
              <Button size="xs" loading={busy} disabled={disabled && !busy} onClick={() => {
                if (disabled) return;
                onCommand({ kind: 'substitute', requestId: crypto.randomUUID(), version: score.version,
                  outgoingParticipantId: outgoingId, incomingParticipantId: incomingId });
              }}>Potvrdi izmenu</Button></Group>
          </Alert> : <Button type="submit" w="fit-content" disabled={disabled}>Pregledaj izmenu</Button>}
          <Button variant="default" w="fit-content" disabled={busy} onClick={cancel}>Odustani od izmene</Button>
        </Stack>
      </form>}
      {editable && mode === 'undo' && <Alert color="yellow" role="alert" title="Poništavanje izmene">
        Poništiti poslednju važeću izmenu{undoable ? ': ' + label(undoable.outgoing) + ' → ' + label(undoable.incoming) : ''}?
        Prethodni igrač će biti vraćen, a zapis ostaje u istoriji. Ovo je ispravka pogrešnog unosa, ne nova odbojkaška izmena.
        <Group mt="sm"><Button variant="default" size="xs" disabled={busy} onClick={cancel}>Odustani od poništavanja izmene</Button>
          <Button color="red" size="xs" loading={busy} disabled={disabled && !busy} onClick={() => {
            if (disabled || !state.undoableId) return;
            onCommand({ kind: 'undoSubstitution', requestId: crypto.randomUUID(), version: score.version, substitutionId: state.undoableId });
          }}>Potvrdi poništavanje izmene</Button></Group>
      </Alert>}
      {state.history.length === 0 && <Text size="sm" c="dimmed">Još nema unetih izmena.</Text>}
      {state.history.length > 0 && <Text size="xs" c="dimmed">Poslednjih 20 izmena · najnovija prva</Text>}
      {state.history.map((row) => <div key={row.id} className="roster-player">
        <Group justify="space-between"><Text size="sm" fw={600}>{teamName(row.teamId)} · {label(row.outgoing)} → {label(row.incoming)}</Text>
          {row.cancelledAt && <Badge color="red" variant="light">Poništena izmena</Badge>}</Group>
        <Text size="xs" c="dimmed">Pri rezultatu {row.homeScore}:{row.awayScore} · {new Date(row.createdAt).toLocaleTimeString('sr-Latn-RS')}</Text>
      </div>)}
    </Stack>
  </Paper>;
}
