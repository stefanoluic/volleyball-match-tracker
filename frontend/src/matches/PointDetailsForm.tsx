import { Alert, Button, Group, Select, Stack, Text } from '@mantine/core';
import { useEffect, useState, type FormEvent } from 'react';
import type { Match, PointActionType, SetScore } from '../api/client';
import { pointActionLabels, pointPlayerLabel, pointPlayerOptions } from './pointDetails';
import type { AddPointCommand } from './commands';

export function PointDetailsForm({ match, score, disabled, busy, onCommand, onEditingChange }: {
  match: Match; score: SetScore; disabled: boolean; busy: boolean;
  onCommand: (command: AddPointCommand) => void; onEditingChange: (editing: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState(match.homeTeam.id);
  const [type, setType] = useState<PointActionType>('ATTACK');
  const [participantId, setParticipantId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setOpen(false); setParticipantId(''); setConfirming(false); setError(''); }, [score.version]);
  useEffect(() => { onEditingChange(open); }, [open, onEditingChange]);
  useEffect(() => () => onEditingChange(false), [onEditingChange]);
  const options = pointPlayerOptions(match, score, teamId, type);
  const selectedId = type === 'SERVICE_ACE' ? options[0]?.id ?? '' : participantId;
  const selected = options.find((player) => player.id === selectedId);
  const teamName = teamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
  const valid = !!selected || (type === 'OPPONENT_ERROR' && !selectedId);
  function cancel() { setOpen(false); setConfirming(false); setError(''); setParticipantId(''); }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (!valid) { setError(type === 'SERVICE_ACE'
      ? 'Izabrani tim trenutno ne servira i ne može osvojiti servis-as.' : 'Izaberite igrača za ovu akciju.'); return; }
    setError(''); setConfirming(true);
  }
  if (!open) return <Button variant="light" w="fit-content" disabled={disabled || !score.canRecord || !score.court}
    onClick={() => setOpen(true)}>Detaljan unos poena</Button>;
  return <form aria-label="Detalji novog poena" onSubmit={prepare} noValidate>
    <Stack gap="md">
      <Select label="Tim koji osvaja poen" value={teamId} allowDeselect={false} disabled={disabled || confirming}
        data={[{ value: match.homeTeam.id, label: match.homeTeam.name }, { value: match.awayTeam.id, label: match.awayTeam.name }]}
        onChange={(id) => { if (id) setTeamId(id); setParticipantId(''); setError(''); }} />
      <Select label="Način osvajanja poena" value={type} allowDeselect={false} disabled={disabled || confirming}
        data={(['ATTACK', 'BLOCK', 'SERVICE_ACE', 'OPPONENT_ERROR'] as const).map((value) => ({ value, label: pointActionLabels[value] }))}
        onChange={(value) => { if (value) setType(value as PointActionType); setParticipantId(''); setError(''); }} />
      {type === 'SERVICE_ACE' ? <Alert color="blue" role="status">{selected
        ? 'Servis-as će biti pripisan serveru: ' + pointPlayerLabel(selected) + '.'
        : 'Izabrani tim trenutno ne servira i ne može osvojiti servis-as.'}</Alert>
        : <Select label={type === 'OPPONENT_ERROR' ? 'Igrač protivnika koji je pogrešio' : 'Igrač koji osvaja poen'}
          description={type === 'OPPONENT_ERROR' ? 'Ostavite prazno ako je u pitanju timska greška ili ne znate ko je pogrešio.' : 'Birate igrača iz postave pre ovog poena.'}
          required={type !== 'OPPONENT_ERROR'} searchable clearable value={participantId || null}
          data={options.map((player) => ({ value: player.id, label: pointPlayerLabel(player) }))}
          placeholder={type === 'OPPONENT_ERROR' ? 'Timska / nepripisana greška' : 'Izaberite igrača'}
          disabled={disabled || confirming} onChange={(id) => { setParticipantId(id ?? ''); setError(''); }} />}
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {confirming ? <Alert color="yellow" role="alert" title="Potvrda poena">
        Poen za {teamName} · {pointActionLabels[type]} · {selected ? pointPlayerLabel(selected) : 'Bez pripisivanja igraču'}.
        <Text size="sm" mt="xs">Ovaj unos dodaje jedan poen. Nije dodatni događaj uz prethodno unet poen.</Text>
        <Group mt="sm"><Button variant="default" size="xs" disabled={disabled} onClick={() => setConfirming(false)}>Promeni detalje</Button>
          <Button size="xs" loading={busy} disabled={disabled && !busy} onClick={() => {
            if (disabled || !valid || !score.canRecord) return;
            onCommand({ kind: 'add', requestId: crypto.randomUUID(), version: score.version,
              scoringTeamId: teamId, actionType: type, participantId: selectedId || null });
          }}>Potvrdi poen</Button></Group>
      </Alert> : <Button type="submit" w="fit-content" disabled={disabled}>Pregledaj poen</Button>}
      <Button variant="default" w="fit-content" disabled={busy} onClick={cancel}>Odustani od poena</Button>
    </Stack>
  </form>;
}
