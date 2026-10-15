import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { LineupPlayer, Match, SetScore, Team } from '../api/client';

const courtOrder = [4, 3, 2, 5, 6, 1];
const placeLabels: Record<number, string> = {
  1: 'Zadnja desna', 2: 'Prednja desna', 3: 'Prednja srednja',
  4: 'Prednja leva', 5: 'Zadnja leva', 6: 'Zadnja srednja',
};

function TeamCourt({ team, rows, serverId, home }: {
  team: Team; rows: LineupPlayer[]; serverId: string | null; home: boolean;
}) {
  return <Paper component="section" aria-label={'Raspored · ' + team.name} withBorder p="md" className="rotation-team">
    <Stack gap="sm">
      <Group justify="space-between"><Title order={3} size="h4">{team.name}</Title>
        <Badge color={home ? 'blue' : 'teal'} variant="light">{home ? 'Domaćin' : 'Gost'}</Badge></Group>
      <Text className="rotation-net" size="xs" fw={700} ta="center">MREŽA</Text>
      <ol className="rotation-grid" aria-label={'Mesta u rotaciji · ' + team.name}>
        {courtOrder.map((position) => {
          const player = rows.find((row) => row.rotationPosition === position)?.participant;
          const serving = !!player && player.id === serverId;
          return <li key={position} className="rotation-player" data-serving={serving || undefined}
            aria-label={'Pozicija ' + position + ' · ' + (player ? '#' + player.jerseyNumber + ' ' + player.firstName + ' ' + player.lastName : 'Nedostaje igrač')}
            aria-current={serving ? 'true' : undefined}>
            <Text size="xs" c="dimmed">{position} · {placeLabels[position]}</Text>
            {player && <><Text fw={700} size="lg">#{player.jerseyNumber}</Text>
              <Text size="sm">{player.firstName} {player.lastName}</Text></>}
            {serving && <Badge size="xs" color="teal">Servira</Badge>}
          </li>;
        })}
      </ol>
      <Text size="xs" c="dimmed">Pogled sa strane ovog tima prema mreži.</Text>
    </Stack>
  </Paper>;
}

export function SetCourtView({ match, score }: { match: Match; score: SetScore }) {
  const court = score.court;
  if (!court) return <Alert color="yellow" title="Raspored nije dostupan">
    Za ovaj set nisu dostupne kompletne početne postave ili usklađena istorija poena.
  </Alert>;
  const server = score.canRecord ? court.server : null;
  const servingTeam = court.servingTeamId === match.homeTeam.id ? match.homeTeam : match.awayTeam;
  return <section aria-label="Rotacioni raspored">
    <Stack gap="md">
      <Title order={2} size="h3">Rotacija i servis</Title>
      <Paper withBorder p="md" className="rotation-service" role="status" aria-live="polite" aria-atomic="true">
        {server && court.servingTeamId ? <Text fw={600}>
          Na servisu: {servingTeam.name} · #{server.jerseyNumber} {server.firstName} {server.lastName}
        </Text> : <Text fw={600}>{score.canFinish ? 'Čeka se potvrda kraja seta — nema narednog servisa.'
          : 'Nema narednog servisa — set ili utakmica nisu u toku.'}</Text>}
      </Paper>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <TeamCourt team={match.homeTeam} rows={court.homeLineup} serverId={server?.id ?? null} home />
        <TeamCourt team={match.awayTeam} rows={court.awayLineup} serverId={server?.id ?? null} home={false} />
      </SimpleGrid>
      <Text size="sm" c="dimmed">Prikazan je redosled u rotaciji, ne fizički položaj igrača tokom akcije.
        Rotira se samo tim koji preuzme servis. Izmene igrača i ulasci libera još nisu podržani.</Text>
    </Stack>
  </section>;
}
