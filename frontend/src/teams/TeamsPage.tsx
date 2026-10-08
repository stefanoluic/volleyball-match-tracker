import {
  Alert, Badge, Button, Group, Modal, Pagination, Paper, SimpleGrid, Skeleton,
  Stack, Text, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle, IconBallVolleyball, IconCheck, IconEye, IconMapPin,
  IconPencil, IconPlus, IconRefresh, IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage, type Team, type TeamInput, type TeamPage } from '../api/client';
import { normalizeTeamInput, validateTeamInput } from './validation';

type Editor = { type: 'create' } | { type: 'edit'; team: Team };
const emptyInput: TeamInput = { name: '', city: '' };
const inputStyles = { input: { color: 'var(--mantine-color-text)' } };

export function TeamsPage({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<TeamPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [input, setInput] = useState<TeamInput>(emptyInput);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    api.teams(page, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      if (page > 0 && data.content.length === 0) setPage(Math.max(0, data.totalPages - 1));
      else setResult(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [page, refresh]);

  function openEditor(next: Editor) {
    if (!canManage || busy) return;
    setInput(next.type === 'edit' ? { name: next.team.name, city: next.team.city } : { ...emptyInput });
    setFields({});
    setFormError('');
    setEditor(next);
  }

  function updateInput(key: keyof TeamInput, value: string) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !editor || busy) return;
    const validation = validateTeamInput(input);
    setFields(validation);
    setFormError('');
    if (Object.keys(validation).length > 0) return;
    setBusy('save');
    try {
      const data = normalizeTeamInput(input);
      if (editor.type === 'create') await api.createTeam(data);
      else await api.updateTeam(editor.team.id, data);
      notifications.show({
        title: editor.type === 'create' ? 'Tim je dodat' : 'Podaci tima su izmenjeni',
        message: data.name, color: 'teal', icon: <IconCheck size={18} aria-hidden="true" />, role: 'status',
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
      await api.deleteTeam(deleting.id);
      notifications.show({
        title: 'Tim je obrisan', message: deleting.name, color: 'teal',
        icon: <IconCheck size={18} aria-hidden="true" />, role: 'status',
      });
      setDeleting(null);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setDeleteError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start" className="page-heading">
        <div>
          <Text size="xs" fw={700} c="blue.7" tt="uppercase" mb={8}>Timovi · Osnova za utakmice</Text>
          <Title order={1} size="h2">Timovi</Title>
          <Text c="dimmed" mt={8}>
            {canManage ? 'Dodajte timove i održavajte njihove osnovne podatke.' : 'Pregled timova i njihovih osnovnih podataka.'}
          </Text>
        </div>
        <Group gap="sm">
          <Button variant="default" size="sm" leftSection={<IconRefresh size={16} aria-hidden="true" />}
            onClick={() => setRefresh((value) => value + 1)} disabled={loading || busy !== null}>Osveži</Button>
          {canManage && <Button size="sm" leftSection={<IconPlus size={17} aria-hidden="true" />}
            disabled={busy !== null} onClick={() => openEditor({ type: 'create' })}>Dodaj tim</Button>}
        </Group>
      </Group>
      {!canManage && <Badge variant="light" color="blue" leftSection={<IconEye size={14} aria-hidden="true" />} w="fit-content">
        Pristup za pregled
      </Badge>}
      {error && <Alert color="red" icon={<IconAlertCircle size={19} aria-hidden="true" />} role="alert">{error}</Alert>}
      <div aria-busy={loading}>
        {loading ? (
          <Stack role="status" aria-label="Učitavanje timova">
            <Text size="sm" c="dimmed">Učitavanje timova…</Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} height={175} radius="lg" />)}
            </SimpleGrid>
          </Stack>
        ) : result ? (
          result.content.length === 0 ? (
            <Paper withBorder p="xl" className="teams-empty">
              <Stack align="center" gap="sm" py="xl">
                <ThemeIcon variant="light" color="blue" size={64} radius="xl">
                  <IconBallVolleyball size={34} stroke={1.5} aria-hidden="true" />
                </ThemeIcon>
                <Title order={2} size="h4" mt="sm">Još nema timova</Title>
                <Text size="sm" c="dimmed" ta="center" maw={370}>
                  {canManage ? 'Dodajte prvi tim da biste započeli pripremu za praćenje utakmica.'
                    : 'Timovi će se pojaviti ovde kada ih statističar doda.'}
                </Text>
                {canManage && <Button variant="light" mt="sm" leftSection={<IconPlus size={17} aria-hidden="true" />}
                  onClick={() => openEditor({ type: 'create' })}>Dodaj prvi tim</Button>}
              </Stack>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {result.content.map((team) => (
                <Paper component="article" aria-label={team.name} key={team.id} withBorder p="lg" className="team-card">
                  <Stack gap="md" h="100%">
                    <ThemeIcon variant="light" color="blue" size={42} radius="md">
                      <IconBallVolleyball size={24} aria-hidden="true" />
                    </ThemeIcon>
                    <div>
                      <Title order={2} size="h4" className="team-name">{team.name}</Title>
                      <Group gap={5} mt={8} wrap="nowrap" c="dimmed">
                        <IconMapPin size={16} aria-hidden="true" />
                        <Text size="sm" className="team-city">{team.city}</Text>
                      </Group>
                    </div>
                    {canManage && <Group gap="xs" mt="auto" pt="sm">
                      <Button size="xs" variant="light" leftSection={<IconPencil size={15} aria-hidden="true" />}
                        disabled={busy !== null} onClick={() => openEditor({ type: 'edit', team })}>Izmeni</Button>
                      <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={15} aria-hidden="true" />}
                        disabled={busy !== null} onClick={() => { setDeleteError(''); setDeleting(team); }}>Obriši</Button>
                    </Group>}
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          )
        ) : <Button variant="light" onClick={() => setRefresh((value) => value + 1)}>Pokušaj ponovo</Button>}
      </div>
      {!loading && result && <Group justify="space-between">
        <Text size="sm" c="dimmed">Ukupno timova: {result.totalElements}</Text>
        {result.totalPages > 1 && <Pagination total={result.totalPages} value={page + 1}
          onChange={(value) => setPage(value - 1)} size="sm" disabled={busy !== null} />}
      </Group>}
      <Modal opened={editor !== null} onClose={() => { if (!busy) setEditor(null); }}
        title={editor?.type === 'edit' ? 'Izmena tima' : 'Novi tim'} centered
        closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy}>
        <form onSubmit={save} noValidate>
          <Stack gap="lg">
            <Text size="sm" c="dimmed">Unesite naziv i grad. Tim sa istim nazivom u istom gradu ne može se dodati dva puta.</Text>
            {formError && <Alert color="red" icon={<IconAlertCircle size={18} aria-hidden="true" />} role="alert">{formError}</Alert>}
            <TextInput label="Naziv tima" placeholder="OK Vojvodina" required maxLength={100}
              value={input.name} disabled={busy !== null} error={fields.name} styles={inputStyles}
              onChange={(event) => updateInput('name', event.currentTarget.value)} />
            <TextInput label="Grad" placeholder="Novi Sad" required maxLength={100}
              value={input.city} disabled={busy !== null} error={fields.city} styles={inputStyles}
              leftSection={<IconMapPin size={17} aria-hidden="true" />}
              onChange={(event) => updateInput('city', event.currentTarget.value)} />
            <Group justify="flex-end">
              <Button variant="default" disabled={busy !== null} onClick={() => setEditor(null)}>Odustani</Button>
              <Button type="submit" loading={busy === 'save'} leftSection={<IconCheck size={17} aria-hidden="true" />}>
                {editor?.type === 'edit' ? 'Sačuvaj izmene' : 'Sačuvaj tim'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <Modal opened={deleting !== null} onClose={() => { if (!busy) setDeleting(null); }} title="Brisanje tima"
        centered closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy}>
        <Stack gap="lg">
          <ThemeIcon color="red" variant="light" size={48} radius="xl"><IconTrash size={24} aria-hidden="true" /></ThemeIcon>
          <Text>Obrisati tim <strong className="team-name">{deleting?.name}</strong>?</Text>
          <Alert color="red" icon={<IconAlertCircle size={18} aria-hidden="true" />}>
            Tim će biti trajno obrisan. Ovu radnju nije moguće poništiti.
          </Alert>
          {deleteError && <Alert color="red" role="alert">{deleteError}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" disabled={busy !== null} onClick={() => setDeleting(null)}>Odustani</Button>
            <Button color="red" loading={busy === 'delete'} leftSection={<IconTrash size={17} aria-hidden="true" />}
              onClick={() => void remove()}>Obriši tim</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
