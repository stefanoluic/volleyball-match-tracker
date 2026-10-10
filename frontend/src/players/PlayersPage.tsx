import {
  Alert, Badge, Button, Group, NumberInput, Pagination, Paper, Select,
  SimpleGrid, Skeleton, Stack, Text, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle, IconArrowLeft, IconCheck, IconEye, IconInfoCircle, IconPencil, IconPlus, IconRefresh, IconShirt, IconTrash, IconUsers,
} from '@tabler/icons-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage, type Player, type PlayerPage, type Team } from '../api/client';
import { normalizePlayerInput, positionLabels, positionOptions, validatePlayerInput, type PlayerFormInput } from './validation';

import { EditorPage } from '../components/EditorPage';
import { InlineDeleteConfirmation } from '../components/InlineDeleteConfirmation';

type Editor = { type: 'create' } | { type: 'edit'; player: Player };
const emptyInput: PlayerFormInput = { firstName: '', lastName: '', jerseyNumber: '', position: '' };
const inputStyles = { input: { color: 'var(--mantine-color-text)' } };

export function PlayersPage({ team: initialTeam, canManage, onBack }: {
  team: Team; canManage: boolean; onBack: () => void;
}) {
  const [team, setTeam] = useState(initialTeam);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PlayerPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [input, setInput] = useState<PlayerFormInput>({ ...emptyInput });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Player | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    Promise.all([api.team(initialTeam.id, controller.signal), api.players(initialTeam.id, page, controller.signal)])
      .then(([currentTeam, data]) => {
        if (controller.signal.aborted) return;
        setTeam(currentTeam);
        if (page > 0 && data.content.length === 0) setPage(Math.max(0, data.totalPages - 1));
        else setResult(data);
      }).catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialTeam.id, page, refresh]);

  function openEditor(next: Editor) {
    if (!canManage || busy || loading || !result) return;
    setInput(next.type === 'edit' ? {
      firstName: next.player.firstName, lastName: next.player.lastName,
      jerseyNumber: next.player.jerseyNumber, position: next.player.position,
    } : { ...emptyInput });
    setFields({});
    setFormError('');
    setDeleting(null);
    setDeleteError('');
    setEditor(next);
  }

  function updateInput<K extends keyof PlayerFormInput>(key: K, value: PlayerFormInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !editor || busy) return;
    const validation = validatePlayerInput(input);
    setFields(validation);
    setFormError('');
    if (Object.keys(validation).length) return;
    setBusy('save');
    try {
      const data = normalizePlayerInput(input);
      if (editor.type === 'create') await api.createPlayer(team.id, data);
      else await api.updatePlayer(team.id, editor.player.id, data);
      notifications.show({
        title: editor.type === 'create' ? 'Igrač je dodat' : 'Podaci igrača su izmenjeni',
        message: data.firstName + ' ' + data.lastName, color: 'teal',
        icon: <IconCheck size={18} aria-hidden="true" />, role: 'status',
      });
      setEditor(null);
      setPage(0);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setFormError(errorMessage(failure));
      if (failure instanceof ApiError) setFields(failure.fields);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!canManage || !deleting || busy) return;
    setBusy('delete');
    setDeleteError('');
    try {
      await api.deletePlayer(team.id, deleting.id);
      notifications.show({
        title: 'Igrač je obrisan', message: deleting.firstName + ' ' + deleting.lastName,
        color: 'teal', icon: <IconCheck size={18} aria-hidden="true" />, role: 'status',
      });
      setDeleting(null);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setDeleteError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  if (editor && canManage) return (
    <EditorPage title={editor.type === 'edit' ? 'Izmena igrača' : 'Novi igrač'}
      category="Sastav tima" icon={<IconUsers size={28} stroke={1.6} />}
      description="Podaci igrača i njegova primarna pozicija u timu."
      busy={busy !== null} breadcrumbs={[
        { label: 'Timovi', onClick: onBack },
        { label: team.name },
        { label: 'Igrači', onClick: () => setEditor(null) },
      ]}>
        <form aria-label={editor.type === 'edit' ? 'Izmena igrača' : 'Novi igrač'} onSubmit={save} noValidate>
          <Stack gap="xl">
            <Group gap={8} wrap="nowrap" className="editor-team-context">
              <IconUsers size={17} aria-hidden="true" />
              <Text size="sm" className="team-name"><span>Tim:</span> <strong>{team.name}</strong></Text>
            </Group>
            {formError && <Alert color="red" role="alert">{formError}</Alert>}
            <Stack gap="md">
              <Text className="editor-section-label">Podaci o igraču</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label="Ime" placeholder="npr. Marko" required maxLength={100}
                  value={input.firstName} error={fields.firstName} disabled={busy !== null} styles={inputStyles}
                  onChange={(event) => updateInput('firstName', event.currentTarget.value)} />
                <TextInput label="Prezime" placeholder="npr. Marković" required maxLength={100}
                  value={input.lastName} error={fields.lastName} disabled={busy !== null} styles={inputStyles}
                  onChange={(event) => updateInput('lastName', event.currentTarget.value)} />
              </SimpleGrid>
            </Stack>
            <Stack gap="md" className="editor-form-section">
              <Text className="editor-section-label">Uloga u timu</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <NumberInput label="Broj dresa" description="Ceo broj od 1 do 99." placeholder="npr. 7"
                  size="md" required min={1} max={99} allowDecimal={false} allowNegative={false}
                  leftSection={<IconShirt size={18} aria-hidden="true" />}
                  value={input.jerseyNumber} error={fields.jerseyNumber} disabled={busy !== null} styles={inputStyles}
                  onChange={(value) => updateInput('jerseyNumber', value)} />
                <Select label="Primarna pozicija" placeholder="Izaberite poziciju" required data={positionOptions}
                  value={input.position || null} error={fields.position} disabled={busy !== null} styles={inputStyles}
                  allowDeselect={false} onChange={(value) => updateInput('position', value ?? '')}
                  description="Uloga igrača, a ne mesto u rotaciji." />
              </SimpleGrid>
            </Stack>
            <Group gap={10} wrap="nowrap" align="flex-start" className="editor-form-note">
              <IconInfoCircle size={18} aria-hidden="true" />
              <Text size="sm">Broj dresa mora biti jedinstven unutar ovog tima.</Text>
            </Group>
            <Group justify="space-between" className="editor-actions">
              <Text size="xs" c="dimmed">Sva polja su obavezna.</Text>
              <Group gap="sm" className="editor-action-buttons">
                <Button variant="default" size="md" disabled={busy !== null} onClick={() => setEditor(null)}>Odustani</Button>
                <Button type="submit" size="md" loading={busy === 'save'} leftSection={<IconCheck size={17} aria-hidden="true" />}>
                  {editor.type === 'edit' ? 'Sačuvaj izmene' : 'Sačuvaj igrača'}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
    </EditorPage>
  );

  return (
    <Stack gap="xl">
      <Button variant="subtle" size="sm" w="fit-content" leftSection={<IconArrowLeft size={17} aria-hidden="true" />}
        disabled={busy !== null || deleting !== null} onClick={onBack}>Nazad na timove</Button>
      <Group justify="space-between" align="flex-start" className="page-heading">
        <div>
          <Text size="xs" fw={700} c="blue.7" tt="uppercase" mb={8}>Sastav tima</Text>
          <Title order={1} size="h2" className="team-name">{team.name}</Title>
          <Text c="dimmed" mt={8}>{team.city} · Igrači i njihove primarne pozicije</Text>
        </div>
        <Group gap="sm">
          <Button variant="default" size="sm" leftSection={<IconRefresh size={16} aria-hidden="true" />}
            onClick={() => setRefresh((value) => value + 1)} disabled={loading || busy !== null || deleting !== null}>Osveži</Button>
          {canManage && <Button size="sm" leftSection={<IconPlus size={17} aria-hidden="true" />}
            disabled={loading || !result || busy !== null || deleting !== null} onClick={() => openEditor({ type: 'create' })}>Dodaj igrača</Button>}
        </Group>
      </Group>
      {!canManage && <Badge variant="light" color="blue" leftSection={<IconEye size={14} aria-hidden="true" />} w="fit-content">
        Pristup za pregled
      </Badge>}
      {error && <Alert color="red" icon={<IconAlertCircle size={19} aria-hidden="true" />} role="alert">{error}</Alert>}
      <div aria-busy={loading}>
        {loading ? (
          <Stack role="status" aria-label="Učitavanje igrača">
            <Text size="sm" c="dimmed">Učitavanje igrača…</Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} height={175} radius="lg" />)}
            </SimpleGrid>
          </Stack>
        ) : result ? (
          result.content.length === 0 ? (
            <Paper withBorder p="xl" className="teams-empty">
              <Stack align="center" gap="sm" py="xl">
                <ThemeIcon variant="light" color="blue" size={64} radius="xl"><IconUsers size={34} aria-hidden="true" /></ThemeIcon>
                <Title order={2} size="h4" mt="sm">Tim još nema igrače</Title>
                <Text size="sm" c="dimmed" ta="center">
                  {canManage ? 'Dodajte igrače i pripremite sastav tima.' : 'Igrači će se pojaviti ovde kada ih statističar doda.'}
                </Text>
                {canManage && <Button variant="light" mt="sm" onClick={() => openEditor({ type: 'create' })}>Dodaj prvog igrača</Button>}
              </Stack>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {result.content.map((player) => (
                <Paper component="article" aria-label={player.firstName + ' ' + player.lastName} key={player.id}
                  withBorder p="lg" className="team-card">
                  <Stack gap="md" h="100%">
                    <Group justify="space-between">
                      <ThemeIcon variant="light" color="blue" size={48} radius="md" aria-label={'Broj dresa ' + player.jerseyNumber}>
                        <Text fw={800} size="xl">{player.jerseyNumber}</Text>
                      </ThemeIcon>
                      <Badge variant="light" color={player.position === 'LIBERO' ? 'teal' : 'blue'}>{positionLabels[player.position]}</Badge>
                    </Group>
                    <Title order={2} size="h4" className="team-name">{player.firstName} {player.lastName}</Title>
                    {canManage && (deleting?.id === player.id ? (
                      <InlineDeleteConfirmation title="Brisanje igrača"
                        question={'Obrisati igrača ' + player.firstName + ' ' + player.lastName + '?'}
                        warning="Igrač će biti trajno obrisan iz baze. Ovu radnju nije moguće poništiti."
                        error={deleteError} busy={busy === 'delete'} confirmLabel="Obriši igrača"
                        onCancel={() => { setDeleting(null); setDeleteError(''); }} onConfirm={() => void remove()} />
                    ) : <Group gap="xs" mt="auto" pt="sm">
                      <Button size="xs" variant="light" leftSection={<IconPencil size={15} aria-hidden="true" />}
                        disabled={busy !== null || deleting !== null} onClick={() => openEditor({ type: 'edit', player })}>Izmeni</Button>
                      <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={15} aria-hidden="true" />}
                        disabled={busy !== null || deleting !== null} onClick={() => { setDeleteError(''); setDeleting(player); }}>Obriši</Button>
                    </Group>)}
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          )
        ) : <Button variant="light" onClick={() => setRefresh((value) => value + 1)}>Pokušaj ponovo</Button>}
      </div>
      {!loading && result && <Group justify="space-between">
        <Text size="sm" c="dimmed">Ukupno igrača: {result.totalElements}</Text>
        {result.totalPages > 1 && <Pagination total={result.totalPages} value={page + 1}
          onChange={(value) => setPage(value - 1)} size="sm" disabled={busy !== null || deleting !== null} />}
      </Group>}
    </Stack>
  );
}
