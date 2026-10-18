import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { CoachingAnalysis } from '../api/client';

export function CoachingRecommendations({ analysis }: { analysis: CoachingAnalysis }) {
  const available = analysis.availability === 'AVAILABLE';
  return <Paper component="section" withBorder p="md" aria-label="Preporuke stručnom štabu">
    <Stack gap="md">
      <Group justify="space-between"><Title order={3} size="h4">Preporuke za pregled igre</Title>
        <Badge color={available ? 'teal' : 'gray'} variant="light">Jednostavna pravila · bez AI modela</Badge></Group>
      <Text size="sm">U izabranom opsegu: {analysis.totalRallies} važećih poena, od toga {analysis.unspecifiedRallies} bez detalja.
        Preporuke su zasnovane na istim podacima kao statistika iznad.</Text>
      {!available ? <Alert color="blue" role="status">{analysis.availability === 'INSUFFICIENT_DATA'
        ? 'Još nema dovoljno podataka za izdvajanje obrazaca. Potrebno je najmanje ' + analysis.minimumRallies + ' važećih poena u izabranom opsegu.'
        : 'Previše poena nema detalje. Za izdvajanje obrazaca potrebno je najmanje ' + analysis.minimumDetailCoveragePercent + '% poena sa detaljima.'}</Alert>
        : <SimpleGrid cols={{ base: 1, md: 2 }}>{analysis.teams.map((team, index) => <Paper key={team.teamId} component="section"
          withBorder p="md" aria-label={'Preporuke · ' + team.name}>
          <Stack gap="sm"><Title order={4} size="h5">{team.name}</Title>
            {team.items.length === 0 ? <Text size="sm" c="dimmed">Nema izdvojenih obrazaca prema postavljenim pravilima. To ne znači da tim nema problema u igri.</Text>
              : team.items.map((item) => <Alert key={item.code} color={index === 0 ? 'blue' : 'teal'} title={item.title}>
                <Text size="sm" fw={600}>{item.observation}</Text><Text size="sm" mt="xs">{item.suggestion}</Text>
              </Alert>)}
          </Stack>
        </Paper>)}</SimpleGrid>}
      <Text size="xs" c="dimmed">Pragovi su pravila ove aplikacije, ne odbojkaški standard niti dokaz uzroka problema.
        Ne predlažemo automatske izmene igrača i ne računamo uspešnost bez podataka o pokušajima i prijemima.</Text>
    </Stack>
  </Paper>;
}
