import {
  Alert, Badge, Button, Group, Pagination, Paper, Select, SimpleGrid, Skeleton,
  Stack, Text, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCalendarEvent, IconCheck, IconPencil, IconPlus, IconRefresh, IconSearch, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage, type Match, type MatchPage, type Team } from '../api/client';
import { EditorPage } from '../components/EditorPage';
import { InlineDeleteConfirmation } from '../components/InlineDeleteConfirmation';
import { formatMatchTime, matchStatusLabels, toLocalDateTime, toMatchInput, validateMatchInput, type MatchFormInput } from './validation';
import { MatchRosterPage } from './MatchRosterPage';
import { MatchPreparationPage } from './MatchPreparationPage';
import { emptyMatchFilters, toMatchListFilters, validateMatchFilters, type MatchFilterInput } from './filters';

type Editor = { type: 'create' } | { type: 'edit'; match: Match };
const emptyInput: MatchFormInput = { homeTeamId: '', awayTeamId: '', localDateTime: '' };
const inputStyles = { input: { color: 'var(--mantine-color-text)' } };

export function MatchesPage({ canManage }: { canManage: boolean }) {
  const [rosterMatchId, setRosterMatchId] = useState<string | null>(null);
  const [preparationMatchId, setPreparationMatchId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<MatchPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [input, setInput] = useState<MatchFormInput>(emptyInput);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [options, setOptions] = useState<Team[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [deleting, setDeleting] = useState<Match | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [filterInput, setFilterInput] = useState<MatchFilterInput>({ ...emptyMatchFilters });
  const [appliedFilters, setAppliedFilters] = useState<MatchFilterInput>({ ...emptyMatchFilters });
  const [filterErrors, setFilterErrors] = useState<Record<string, string>>({});
  const requestFilters = useMemo(() => toMatchListFilters(appliedFilters), [appliedFilters]);
  const hasFilters = Object.keys(requestFilters).length > 0;
  const filtersChanged = JSON.stringify(filterInput) !== JSON.stringify(appliedFilters);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    api.matches(page, controller.signal, requestFilters).then((data) => {
      if (controller.signal.aborted) return;
      if (page > 0 && data.content.length === 0) setPage(Math.max(0, data.totalPages - 1));
      else setResult(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [page, refresh, requestFilters]);

  useEffect(() => {
    if (!editor) return;
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError('');
    setOptions([]);
    api.teamOptions(controller.signal).then((data) => {
      if (!controller.signal.aborted) setOptions(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setOptionsError(errorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setOptionsLoading(false);
    });
    return () => controller.abort();
  }, [editor, optionsAttempt]);

  function openEditor(next: Editor) {
    if (!canManage || busy) return;
    setInput(next.type === 'create' ? { ...emptyInput } : {
      homeTeamId: next.match.homeTeam.id, awayTeamId: next.match.awayTeam.id,
      localDateTime: toLocalDateTime(next.match.scheduledAt),
    });
    setFields({});
    setFormError('');
    setDeleting(null);
    setEditor(next);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || deleting) return;
    const errors = validateMatchFilters(filterInput);
    setFilterErrors(errors);
    if (Object.keys(errors).length) return;
    const normalized = { ...filterInput, q: filterInput.q.trim().normalize('NFC') };
    setFilterInput(normalized);
    setPage(0);
    setAppliedFilters(normalized);
  }

  function clearFilters() {
    if (busy || deleting) return;
    setFilterInput({ ...emptyMatchFilters });
    setAppliedFilters({ ...emptyMatchFilters });
    setFilterErrors({});
    setPage(0);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !editor || busy || optionsLoading || optionsError || options.length < 2) return;
    const validation = validateMatchInput(input);
    if (input.homeTeamId && !options.some((team) => team.id === input.homeTeamId)) validation.homeTeamId = 'Izaberite postojeći tim.';
    if (input.awayTeamId && !options.some((team) => team.id === input.awayTeamId)) validation.awayTeamId = 'Izaberite postojeći tim.';
    setFields(validation);
    setFormError('');
    if (Object.keys(validation).length > 0) return;
    setBusy('save');
    try {
      const data = toMatchInput(input);
      if (editor.type === 'create') await api.createMatch(data);
      else await api.updateMatch(editor.match.id, data);
      notifications.show({
        title: editor.type === 'create' ? 'Utakmica je dodata' : 'Utakmica je izmenjena',
        message: hasFilters ? 'Podaci su sačuvani. Lista i dalje koristi izabrane filtere.' : 'Podaci su sačuvani.',
        color: 'teal', icon: <IconCheck size={18} />, role: 'status',
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
      await api.deleteMatch(deleting.id);
      notifications.show({ title: 'Utakmica je obrisana', message: 'Timovi i igrači su sačuvani.', color: 'teal', role: 'status' });
      setDeleting(null);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setDeleteError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  const teamOptions = options.map((team) => ({ value: team.id, label: team.name + ' · ' + team.city }));
  const locked = busy !== null;
  if (preparationMatchId) return <MatchPreparationPage matchId={preparationMatchId} canManage={canManage}
    onBack={() => { setPreparationMatchId(null); setRefresh((value) => value + 1); }} />;
  if (rosterMatchId) return <MatchRosterPage matchId={rosterMatchId} canManage={canManage}
    onBack={() => { setRosterMatchId(null); setRefresh((value) => value + 1); }} />;
  if (editor && canManage) return (
    <EditorPage title={editor.type === 'create' ? 'Nova utakmica' : 'Izmena utakmice'}
      category="Raspored utakmica" icon={<IconCalendarEvent size={28} stroke={1.6} />}
      description="Izaberite učesnike i termin odbojkaške utakmice."
      busy={locked} breadcrumbs={[{ label: 'Utakmice', onClick: () => setEditor(null) }]}>
      <form aria-label={editor.type === 'create' ? 'Nova utakmica' : 'Izmena utakmice'} onSubmit={save} noValidate>
        <Stack gap="xl">
          {formError && <Alert color="red" role="alert">{formError}</Alert>}
          {optionsError && <Alert color="red" role="alert">{optionsError}
            <Button variant="light" size="xs" mt="sm" onClick={() => setOptionsAttempt((value) => value + 1)}>Osveži timove</Button>
          </Alert>}
          {optionsLoading && <Text size="sm" role="status">Učitavanje timova…</Text>}
          {!optionsLoading && !optionsError && options.length < 2 && (
            <Alert color="blue">Za utakmicu su potrebna najmanje dva tima. Dodajte ih u sekciji Timovi.</Alert>
          )}
          <Stack gap="md">
            <Text className="editor-section-label">Učesnici</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select label="Domaći tim" placeholder="Izaberite domaćina" required searchable clearable
                data={teamOptions.map((team) => ({ ...team, disabled: team.value === input.awayTeamId }))}
                value={input.homeTeamId || null} error={fields.homeTeamId} styles={inputStyles}
                disabled={locked || optionsLoading || !!optionsError} nothingFoundMessage="Nema timova"
                onChange={(value) => setInput((current) => ({ ...current, homeTeamId: value ?? '' }))} />
              <Select label="Gostujući tim" placeholder="Izaberite gosta" required searchable clearable
                data={teamOptions.map((team) => ({ ...team, disabled: team.value === input.homeTeamId }))}
                value={input.awayTeamId || null} error={fields.awayTeamId} styles={inputStyles}
                disabled={locked || optionsLoading || !!optionsError} nothingFoundMessage="Nema timova"
                onChange={(value) => setInput((current) => ({ ...current, awayTeamId: value ?? '' }))} />
            </SimpleGrid>
            <TextInput label="Datum i vreme" type="datetime-local" step={1} required
              value={input.localDateTime} error={fields.scheduledAt} disabled={locked} styles={inputStyles}
              description={'Vremenska zona: ' + timeZone}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setInput((current) => ({ ...current, localDateTime: value }));
              }} />
          </Stack>
          <Text size="sm" c="dimmed">Posle čuvanja prijavite sastave i izaberite početne postave. Utakmica počinje tek nakon potvrde statističara.</Text>
          <Group justify="space-between" className="editor-actions">
            <Text size="xs" c="dimmed">Sva polja su obavezna.</Text>
            <Group className="editor-action-buttons">
              <Button variant="default" size="md" disabled={locked} onClick={() => setEditor(null)}>Odustani</Button>
              <Button type="submit" size="md" loading={busy === 'save'}
                disabled={optionsLoading || !!optionsError || options.length < 2} leftSection={<IconCheck size={17} />}>
                {editor.type === 'create' ? 'Sačuvaj utakmicu' : 'Sačuvaj izmene'}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </EditorPage>
  );

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start" className="page-heading section-heading">
        <div>
          <Text size="xs" fw={700} c="blue.7" tt="uppercase" mb={8}>Raspored · Utakmice</Text>
          <Title order={1} size="h2">Utakmice</Title>
          <Text c="dimmed" mt={8}>{canManage ? 'Zakažite utakmicu i upravljajte njenim osnovnim podacima.' : 'Pregled učesnika i termina utakmica.'}</Text>
        </div>
        <Group>
          <Button variant="default" leftSection={<IconRefresh size={17} />} disabled={loading || locked || !!deleting}
            onClick={() => setRefresh((value) => value + 1)}>Osveži</Button>
          {canManage && <Button leftSection={<IconPlus size={17} />} disabled={locked || !!deleting}
            onClick={() => openEditor({ type: 'create' })}>Dodaj utakmicu</Button>}
        </Group>
      </Group>
      {!canManage && <Badge variant="light">Pristup za pregled</Badge>}
      <Paper component="form" aria-label="Pretraga i filteri utakmica" withBorder p="lg" onSubmit={applyFilters} noValidate>
        <Stack gap="md">
          <Text fw={600}>Pronađite utakmicu</Text>
          <TextInput label="Naziv tima" placeholder="Npr. Vojvodina" maxLength={100} value={filterInput.q}
            leftSection={<IconSearch size={17} />} error={filterErrors.q} styles={inputStyles} disabled={locked || !!deleting}
            description="Pretraga domaćeg ili gostujućeg tima, bez razlikovanja velikih i malih slova."
            onChange={(event) => { const q = event.currentTarget.value; setFilterInput((current) => ({ ...current, q })); }} />
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Select label="Status utakmice" value={filterInput.status} allowDeselect={false} error={filterErrors.status}
              disabled={locked || !!deleting} data={[{ value: 'ALL', label: 'Sve utakmice' },
                { value: 'SCHEDULED', label: 'Zakazane' }, { value: 'LIVE', label: 'U toku' }, { value: 'FINISHED', label: 'Završene' }]}
              onChange={(status) => {
                if (status === 'ALL' || status === 'SCHEDULED' || status === 'LIVE' || status === 'FINISHED')
                  setFilterInput((current) => ({ ...current, status }));
              }} />
            <TextInput label="Od datuma" type="date" value={filterInput.fromDate} error={filterErrors.fromDate}
              disabled={locked || !!deleting} styles={inputStyles}
              onChange={(event) => { const fromDate = event.currentTarget.value; setFilterInput((current) => ({ ...current, fromDate })); }} />
            <TextInput label="Do datuma" type="date" value={filterInput.toDate} error={filterErrors.toDate}
              disabled={locked || !!deleting} styles={inputStyles}
              onChange={(event) => { const toDate = event.currentTarget.value; setFilterInput((current) => ({ ...current, toDate })); }} />
          </SimpleGrid>
          <Text size="xs" c="dimmed">Oba datuma su uključena u period, prema vremenskoj zoni {timeZone}. Možete zadati samo jedan datum.</Text>
          <Group>
            <Button type="submit" leftSection={<IconSearch size={16} />} disabled={locked || !!deleting}>Primeni filtere</Button>
            <Button variant="default" onClick={clearFilters}
              disabled={locked || !!deleting || (!hasFilters && !filtersChanged && !Object.keys(filterErrors).length)}>Poništi filtere</Button>
          </Group>
          {filtersChanged && <Text size="sm" c="dimmed" role="status">Filteri su izmenjeni. Prikaz koristi prethodni izbor dok ne pritisnete „Primeni filtere“.</Text>}
        </Stack>
      </Paper>
      <Text size="xs" c="dimmed">Najnoviji termini prvo · Vremenska zona: {timeZone}</Text>
      {error && <Alert color="red" icon={<IconAlertCircle size={18} />} role="alert">{error}</Alert>}
      <div aria-busy={loading}>
        {loading ? <SimpleGrid cols={{ base: 1, sm: 2 }}>{[0, 1].map((key) => <Skeleton key={key} height={190} radius="md" />)}</SimpleGrid>
          : result ? result.content.length === 0 ? (
            <Paper withBorder p="xl" radius="md" className="teams-empty"><Stack align="center" gap="sm">
              <ThemeIcon variant="light" size={54} radius="xl"><IconCalendarEvent size={28} /></ThemeIcon>
              <Title order={2} size="h4">{hasFilters ? 'Nema utakmica za izabrane filtere' : 'Još nema utakmica'}</Title>
              <Text c="dimmed" ta="center">{hasFilters ? 'Promenite naziv tima, status ili datume, ili poništite filtere.'
                : canManage ? 'Dodajte prvu utakmicu između dva postojeća tima.' : 'Zakazane utakmice će biti prikazane ovde.'}</Text>
            </Stack></Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {result.content.map((match) => {
                const title = match.homeTeam.name + ' — ' + match.awayTeam.name;
                return (
                  <Paper key={match.id} component="article" aria-label={title} withBorder p="lg" radius="md" className="match-card">
                    <Stack gap="md">
                      <Group justify="space-between">
                        <ThemeIcon variant="light" size={40} radius="md"><IconCalendarEvent size={23} /></ThemeIcon>
                        <Badge color={match.status === 'LIVE' ? 'teal' : match.status === 'FINISHED' ? 'gray' : 'blue'}>{matchStatusLabels[match.status]}</Badge>
                      </Group>
                      <div>
                        <Title order={2} size="h4" className="team-name">{title}</Title>
                        <Text size="xs" c="dimmed" mt={4}>Domaćin: {match.homeTeam.city} · Gost: {match.awayTeam.city}</Text>
                        <Text size="sm" fw={600} mt="sm"><time dateTime={match.scheduledAt}>{formatMatchTime(match.scheduledAt)}</time></Text>
                      </div>
                      <Button variant="light" size="sm" disabled={locked || !!deleting}
                        onClick={() => setRosterMatchId(match.id)}>Prikaži sastave</Button>
                      <Button color="teal" variant="light" size="sm" disabled={locked || !!deleting}
                        onClick={() => setPreparationMatchId(match.id)}>
                        {match.status === 'SCHEDULED' ? 'Početne postave' : 'Pregled utakmice'}
                      </Button>
                      {canManage && match.status === 'SCHEDULED' && (deleting?.id === match.id ? (
                        <InlineDeleteConfirmation title="Brisanje utakmice" question={'Obrisati utakmicu ' + title + '?'}
                          warning="Utakmica i njeni sačuvani sastavi će biti trajno obrisani. Timovi i igrači neće biti obrisani."
                          error={deleteError} busy={busy === 'delete'} confirmLabel="Obriši utakmicu"
                          onCancel={() => { setDeleting(null); setDeleteError(''); }} onConfirm={() => void remove()} />
                      ) : (
                        <Group gap="xs">
                          <Button size="xs" variant="light" leftSection={<IconPencil size={15} />} disabled={locked || !!deleting}
                            onClick={() => openEditor({ type: 'edit', match })}>Izmeni</Button>
                          <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={15} />} disabled={locked || !!deleting}
                            onClick={() => { setDeleteError(''); setDeleting(match); }}>Obriši</Button>
                        </Group>
                      ))}
                    </Stack>
                  </Paper>
                );
              })}
            </SimpleGrid>
          ) : <Button variant="light" onClick={() => setRefresh((value) => value + 1)}>Pokušaj ponovo</Button>}
      </div>
      {!loading && result && <Group justify="space-between">
        <Text size="sm" c="dimmed">{hasFilters ? 'Pronađeno utakmica: ' : 'Ukupno utakmica: '}{result.totalElements}</Text>
        {result.totalPages > 1 && <Pagination total={result.totalPages} value={page + 1} size="sm" disabled={locked || !!deleting}
          onChange={(value) => setPage(value - 1)} />}
      </Group>}
    </Stack>
  );
}
