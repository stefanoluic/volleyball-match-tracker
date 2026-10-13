import { Alert, Badge, Button, Checkbox, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCheck, IconRefresh, IconUsers } from '@tabler/icons-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, type MatchRoster, type MatchRosterInput, type RosterPlayerInput, type TeamRoster } from '../api/client';
import { EditorPage } from '../components/EditorPage';
import { positionLabels } from '../players/validation';
import { formatMatchTime, matchStatusLabels } from './validation';
import { initialRosterInput, rosterRows, sameSelection, validateRosterInput } from './roster';

function TeamSelection({ team, selection, readOnly, disabled, error, onChange }: {
  team: TeamRoster; selection: RosterPlayerInput[]; readOnly: boolean; disabled: boolean;
  error?: string; onChange: (selection: RosterPlayerInput[]) => void;
}) {
  const rows = rosterRows(team, readOnly);
  return (
    <Paper component="section" aria-label={'Sastav: ' + team.team.name} withBorder p="lg" className="roster-team">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div><Title order={2} size="h4" className="team-name">{team.team.name}</Title><Text size="xs" c="dimmed">{team.team.city}</Text></div>
          <Badge color="teal">Izabrano: {selection.length}</Badge>
        </Group>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        {rows.length === 0 && <Text size="sm" c="dimmed">
          {readOnly ? 'Sastav još nije izabran.' : 'Tim nema igrače. Najpre ih dodajte u sekciji Timovi i igrači.'}
        </Text>}
        {rows.map((player) => {
          const chosen = selection.find((entry) => entry.playerId === player.playerId);
          const name = player.firstName + ' ' + player.lastName;
          const label = '#' + player.jerseyNumber + ' ' + name;
          return (
            <div key={player.playerId} className="roster-player" data-selected={!!chosen || undefined}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div className="roster-player-copy">
                  {readOnly ? <Text fw={600} size="sm">{label}</Text> : (
                    <Checkbox label={label} checked={!!chosen} disabled={disabled}
                      onChange={(event) => {
                        if (event.currentTarget.checked) onChange([...selection, {
                          playerId: player.playerId, isLibero: player.position === 'LIBERO',
                        }]);
                        else onChange(selection.filter((entry) => entry.playerId !== player.playerId));
                      }} />
                  )}
                  <Text size="xs" c="dimmed" mt={5} pl={readOnly ? 0 : 28}>{positionLabels[player.position]}</Text>
                </div>
                {readOnly ? chosen?.isLibero && <Badge size="xs" color="teal">Libero</Badge> : (
                  <Checkbox label="Libero" aria-label={'Libero za ' + name}
                    className="roster-libero" size="xs" checked={chosen?.isLibero ?? false}
                    disabled={disabled || !chosen} onChange={(event) => {
                      const isLibero = event.currentTarget.checked;
                      onChange(selection.map((entry) => entry.playerId === player.playerId ? { ...entry, isLibero } : entry));
                    }} />
                )}
              </Group>
            </div>
          );
        })}
        {!readOnly && <Text size="xs" c="dimmed">Libero oznaka važi za ovaj meč. Moguće je označiti do dva libera.</Text>}
      </Stack>
    </Paper>
  );
}

export function MatchRosterPage({ matchId, canManage, onBack }: { matchId: string; canManage: boolean; onBack: () => void }) {
  const [roster, setRoster] = useState<MatchRoster | null>(null);
  const [input, setInput] = useState<MatchRosterInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [navigation, setNavigation] = useState<'back' | 'reload' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setSaveError('');
    setFields({});
    api.matchRoster(matchId, controller.signal).then((data) => {
      if (!controller.signal.aborted) { setRoster(data); setInput(initialRosterInput(data)); }
    }).catch((failure) => {
      if (!controller.signal.aborted) setLoadError(errorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [matchId, attempt]);

  const editable = canManage && roster?.match.status === 'SCHEDULED';
  const original = roster ? initialRosterInput(roster) : null;
  const dirty = !!(input && original && (!sameSelection(input.homePlayers, original.homePlayers)
    || !sameSelection(input.awayPlayers, original.awayPlayers)));

  function navigate(destination: 'back' | 'reload') {
    if (busy) return;
    if (dirty) setNavigation(destination);
    else if (destination === 'back') onBack();
    else setAttempt((value) => value + 1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roster || !input || !editable || busy || loading || navigation) return;
    const errors = validateRosterInput(roster, input);
    setFields(errors);
    setSaveError('');
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const data = await api.saveMatchRoster(matchId, input);
      setRoster(data);
      setInput(initialRosterInput(data));
      notifications.show({ title: 'Sastavi su sačuvani', message: 'Izabrani učesnici i oznake libera su sačuvani.',
        color: 'teal', icon: <IconCheck size={18} aria-hidden="true" />, role: 'status' });
    } catch (failure) {
      setSaveError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (loading || loadError || !roster || !input) return (
    <Stack gap="lg">
      <Button variant="subtle" w="fit-content" leftSection={<IconArrowLeft size={17} />} onClick={onBack}>Nazad na utakmice</Button>
      <Title order={1} size="h2">Sastavi utakmice</Title>
      {loading ? <Stack role="status" aria-label="Učitavanje sastava"><Skeleton height={120} /><Skeleton height={220} /></Stack>
        : <Alert color="red" role="alert">{loadError || 'Sastav nije dostupan.'}
          <Button variant="light" mt="sm" onClick={() => setAttempt((value) => value + 1)}>Pokušaj ponovo</Button>
        </Alert>}
    </Stack>
  );

  const title = roster.match.homeTeam.name + ' — ' + roster.match.awayTeam.name;
  return (
    <EditorPage title="Sastavi utakmice" category={title} icon={<IconUsers size={28} aria-hidden="true" />}
      description={formatMatchTime(roster.match.scheduledAt) + ' · ' + matchStatusLabels[roster.match.status]}
      busy={busy} breadcrumbs={[{ label: 'Utakmice', onClick: () => navigate('back') }]}>
      <form aria-label="Sastavi utakmice" onSubmit={save} noValidate>
        <Stack gap="xl">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">{editable ? 'Označite učesnike za oba tima. Ovo nije izbor početne šestorke.' : 'Pregled sačuvanih učesnika utakmice.'}</Text>
            <Button variant="light" size="xs" disabled={busy} leftSection={<IconRefresh size={15} />}
              onClick={() => navigate('reload')}>Učitaj sačuvani sastav</Button>
          </Group>
          {!editable && <Badge w="fit-content" variant="light">Pristup za pregled</Badge>}
          {saveError && <Alert color="red" role="alert">{saveError}</Alert>}
          {navigation && <Alert color="yellow" role="alert" title="Nesačuvane izmene">
            Izmene sastava nisu sačuvane. Želite li da ih odbacite?
            <Group mt="sm">
              <Button variant="default" size="xs" disabled={busy} onClick={() => setNavigation(null)}>Nastavi uređivanje</Button>
              <Button color="yellow" size="xs" disabled={busy} onClick={() => {
                const destination = navigation;
                setNavigation(null);
                if (destination === 'back') onBack();
                else setAttempt((value) => value + 1);
              }}>Odbaci izmene</Button>
            </Group>
          </Alert>}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Stack gap="xs">
              <Text className="editor-section-label">Domaći tim</Text>
              <TeamSelection team={roster.home} selection={input.homePlayers} readOnly={!editable}
                disabled={busy || !!navigation} error={fields.homePlayers}
                onChange={(homePlayers) => { setInput({ ...input, homePlayers }); setFields({}); }} />
            </Stack>
            <Stack gap="xs">
              <Text className="editor-section-label">Gostujući tim</Text>
              <TeamSelection team={roster.away} selection={input.awayPlayers} readOnly={!editable}
                disabled={busy || !!navigation} error={fields.awayPlayers}
                onChange={(awayPlayers) => { setInput({ ...input, awayPlayers }); setFields({}); }} />
            </Stack>
          </SimpleGrid>
          {editable && <Text size="xs" c="dimmed">Možete sačuvati nepotpun ili prazan sastav. Za već izabrane igrače prikazuju se sačuvani podaci za ovaj meč, čak i ako su kasnije promenjeni u timu.</Text>}
          <Group justify="space-between" className="editor-actions">
            <Text size="xs" c="dimmed">{dirty ? 'Imate nesačuvane izmene.' : 'Prikazan je sačuvani sastav.'}</Text>
            <Group className="editor-action-buttons">
              <Button variant="default" disabled={busy} onClick={() => navigate('back')}>Nazad na utakmice</Button>
              {editable && <Button type="submit" loading={busy} disabled={!!navigation} leftSection={<IconCheck size={17} />}>Sačuvaj sastave</Button>}
            </Group>
          </Group>
        </Stack>
      </form>
    </EditorPage>
  );
}
