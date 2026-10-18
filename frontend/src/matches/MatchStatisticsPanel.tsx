import { Alert, Badge, Button, Group, Paper, Select, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { IconChartBar, IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, errorMessage, type Match, type MatchStatistics, type TeamStatistics } from '../api/client';
import { useLiveRefresh } from './useLiveRefresh';
import { LiveRefreshNotice } from './LiveRefreshNotice';

const metrics: { key: keyof Pick<TeamStatistics, 'totalPoints' | 'attackPoints' | 'blockPoints' | 'serviceAces'
  | 'opponentErrors' | 'unspecifiedPoints' | 'errors' | 'unattributedErrors'>; label: string }[] = [
  { key: 'totalPoints', label: 'Ukupno poena' },
  { key: 'attackPoints', label: 'Poeni napadom' },
  { key: 'blockPoints', label: 'Poeni blokom' },
  { key: 'serviceAces', label: 'Servis-asovi' },
  { key: 'opponentErrors', label: 'Poeni greškom protivnika' },
  { key: 'unspecifiedPoints', label: 'Poeni bez detalja' },
  { key: 'errors', label: 'Zabeležene greške za poen protivnika' },
  { key: 'unattributedErrors', label: 'Od toga nepripisane igraču' },
];

function PlayerTable({ team, color }: { team: TeamStatistics; color: string }) {
  return <Paper component="section" withBorder p="md" aria-label={'Statistika igrača · ' + team.name}>
    <Stack gap="sm">
      <Group justify="space-between"><Title order={3} size="h4">{team.name}</Title><Badge color={color}>Igrači</Badge></Group>
      {team.players.length === 0 ? <Text size="sm" c="dimmed">Nema prijavljenih igrača.</Text>
        : <Table.ScrollContainer minWidth={580}>
          <Table striped highlightOnHover captionSide="top">
            <Table.Caption>Učinak igrača · {team.name}</Table.Caption>
            <Table.Thead><Table.Tr><Table.Th scope="col">Igrač</Table.Th><Table.Th scope="col">Napad</Table.Th>
              <Table.Th scope="col">Blok</Table.Th><Table.Th scope="col">As</Table.Th>
              <Table.Th scope="col">Osvojeni poeni</Table.Th><Table.Th scope="col">Greške</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{team.players.map((row) => <Table.Tr key={row.participant.id}>
              <Table.Th scope="row">#{row.participant.jerseyNumber} {row.participant.firstName} {row.participant.lastName}
                {row.participant.isLibero && <Badge ml="xs" size="xs" variant="light" color="violet">Libero</Badge>}</Table.Th>
              <Table.Td>{row.attackPoints}</Table.Td><Table.Td>{row.blockPoints}</Table.Td><Table.Td>{row.serviceAces}</Table.Td>
              <Table.Td fw={700}>{row.scoringPoints}</Table.Td><Table.Td>{row.errors}</Table.Td>
            </Table.Tr>)}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>}
    </Stack>
  </Paper>;
}

export function MatchStatisticsPanel({ match, revision, disabled, automatic = false }: {
  match: Match; revision: string; disabled: boolean; automatic?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<string | null>(null);
  const [data, setData] = useState<MatchStatistics | null>(null);
  const [loadedRevision, setLoadedRevision] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!expanded || disabled) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    api.matchStatistics(match.id, scope, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setData(result); setLoadedRevision(revision + ':' + attempt); }
    }).catch((failure) => { if (!controller.signal.aborted) setError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [match.id, scope, expanded, revision, disabled, attempt]);
  const liveEnabled = automatic && expanded && !disabled && !loading && match.status === 'LIVE'
    && data?.matchStatus !== 'FINISHED' && (scope === null || data?.sets.find((set) => set.id === scope)?.status !== 'FINISHED');
  const live = useLiveRefresh(liveEnabled, match.id + ':' + scope + ':' + revision + ':' + attempt, async (signal) => {
    const result = await api.matchStatistics(match.id, scope, signal);
    if (signal.aborted) return;
    setData(result); setLoadedRevision(revision + ':' + attempt); setError('');
  });
  const current = data?.matchId === match.id && data.setId === scope && loadedRevision === revision + ':' + attempt ? data : null;
  const scopeLabel = scope === null ? 'Cela utakmica' : 'Set ' + data?.sets.find((set) => set.id === scope)?.number;
  return <Paper component="section" withBorder p="lg" className="roster-team" aria-label="Statistika utakmice">
    <Stack gap="md">
      <Group justify="space-between"><Title order={2} size="h3">Statistika</Title>
        <Button variant="light" disabled={disabled} leftSection={<IconChartBar size={17} />}
          aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Sakrij statistiku' : 'Prikaži statistiku'}</Button></Group>
      {!expanded && <Text size="sm" c="dimmed">Pregled timova i igrača za jedan set ili celu utakmicu.</Text>}
      {expanded && <>
        <Group align="flex-end" justify="space-between">
          <Select label="Opseg statistike" w={{ base: '100%', sm: 260 }} value={scope ?? 'ALL'} allowDeselect={false}
            disabled={disabled} data={[{ value: 'ALL', label: 'Cela utakmica' },
              ...(data?.matchId === match.id ? data.sets : []).map((set) => ({ value: set.id,
                label: 'Set ' + set.number + ' · ' + (set.status === 'LIVE' ? 'U toku' : 'Završen') }))]}
            onChange={(value) => { if (value) setScope(value === 'ALL' ? null : value); }} />
          <Button variant="light" disabled={disabled || loading} leftSection={<IconRefresh size={16} />}
            onClick={() => setAttempt((value) => value + 1)}>Osveži statistiku</Button>
        </Group>
        {liveEnabled ? <LiveRefreshNotice state={live} label="statistika" />
          : <Text size="xs" c="dimmed">Završeni setovi ostaju za pregled. Za najnovije podatke možete ručno osvežiti statistiku.</Text>}
        {disabled ? <Alert color="blue">Statistika trenutno nije dostupna dok je unos otvoren, zahtev u toku ili rezultat nije potvrđen. Završite ili otkažite unos i po potrebi osvežite rezultat.</Alert>
          : loading || (!error && !current) ? <Stack role="status" aria-label="Učitavanje statistike"><Skeleton height={95} /><Skeleton height={200} /></Stack>
          : error ? <Alert color="red" role="alert">{error}</Alert>
          : current && <>
            <Badge variant="light" color="blue" w="fit-content">{scopeLabel}</Badge>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {[current.home, current.away].map((team, index) => <Paper key={team.teamId} withBorder p="md"
                aria-label={'Zbir poena · ' + team.name} bg={index === 0 ? 'blue.0' : 'teal.0'}>
                <Text size="sm" fw={600}>{team.name}</Text><Text size="xl" fw={800}>{team.totalPoints} {team.totalPoints % 10 === 1 && team.totalPoints % 100 !== 11 ? 'poen' : 'poena'}</Text>
                <Text size="xs" c="dimmed">Napad + blok + as + greške protivnika + poeni bez detalja</Text>
              </Paper>)}
            </SimpleGrid>
            {current.home.totalPoints + current.away.totalPoints === 0 && <Alert color="blue">U izabranom opsegu još nema važećih poena.</Alert>}
            <Table.ScrollContainer minWidth={460}>
              <Table striped captionSide="top">
                <Table.Caption>Pregled timova</Table.Caption>
                <Table.Thead><Table.Tr><Table.Th scope="col">Podatak</Table.Th>
                  <Table.Th scope="col">{current.home.name}</Table.Th><Table.Th scope="col">{current.away.name}</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{metrics.map(({ key, label }) => <Table.Tr key={key}><Table.Th scope="row">{label}</Table.Th>
                  <Table.Td>{current.home[key]}</Table.Td><Table.Td>{current.away[key]}</Table.Td></Table.Tr>)}</Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Alert color="blue">Računaju se samo važeći, neponišteni poeni. Poeni bez detalja ne pripisuju se igračima.
              Greške su samo zabeležene greške koje su donele poen protivniku, ne sve greške tokom igre.</Alert>
            <PlayerTable team={current.home} color="blue" /><PlayerTable team={current.away} color="teal" />
            <Text size="xs" c="dimmed">Prikazani su svi prijavljeni igrači, uključujući one sa nulama. Nula ne znači da igrač nije igrao.
              Osvojeni poeni igrača su zbir napada, blokova i asova; ne uključuju greške protivnika.
              Ne računamo procente uspešnosti jer ne beležimo sve pokušaje, prijeme i dodire lopte.</Text>
          </>}
      </>}
    </Stack>
  </Paper>;
}
