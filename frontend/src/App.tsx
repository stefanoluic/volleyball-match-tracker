import { Badge, Button, Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';

type ConnectionState = 'checking' | 'ready' | 'unavailable';

export function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function checkConnection() {
      setConnection('checking');

      try {
        const response = await fetch('/api/system/health', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Health check returned ${response.status}`);
        }

        const result: unknown = await response.json();
        const isHealthy =
          typeof result === 'object' &&
          result !== null &&
          'status' in result &&
          result.status === 'UP';

        if (!controller.signal.aborted) {
          setConnection(isHealthy ? 'ready' : 'unavailable');
        }
      } catch {
        if (!controller.signal.aborted) {
          setConnection('unavailable');
        }
      }
    }

    void checkConnection();
    return () => controller.abort();
  }, [attempt]);

  return (
    <Container component="main" size="sm" className="setup-page">
      <Stack gap="xl">
        <Stack gap="sm">
          <Text size="sm" fw={600} c="dimmed">Volleyball Match Tracker</Text>
          <Title order={1}>Projekat je postavljen.</Title>
          <Text c="dimmed">
            Početna provera veze između React aplikacije, backenda i baze.
          </Text>
        </Stack>

        <Paper
          component="section"
          withBorder
          shadow="xs"
          p="xl"
          aria-labelledby="connection-heading"
        >
          <Stack gap="lg">
            <Group justify="space-between">
              <Title order={2} size="h3" id="connection-heading">
                Status povezivanja
              </Title>
              <Badge
                color={connection === 'ready' ? 'green' : connection === 'unavailable' ? 'red' : 'gray'}
              >
                {connection === 'checking' ? 'Provera' : connection === 'ready' ? 'Povezano' : 'Nedostupno'}
              </Badge>
            </Group>

            <div role="status">
              <Group gap="sm" wrap="nowrap" align="flex-start">
                {connection === 'checking' && <Loader size="sm" aria-hidden="true" />}
                <Text c={connection === 'unavailable' ? 'red.8' : undefined}>
                  {connection === 'checking' && 'Provera je u toku…'}
                  {connection === 'ready' && 'React → Spring Boot → PostgreSQL: veza radi.'}
                  {connection === 'unavailable' &&
                    'Veza nije dostupna. Proveri da li su backend i baza pokrenuti.'}
                </Text>
              </Group>
            </div>

            <Group>
              <Button
                loading={connection === 'checking'}
                disabled={connection === 'checking'}
                onClick={() => setAttempt((current) => current + 1)}
              >
                Proveri ponovo
              </Button>
            </Group>
          </Stack>
        </Paper>

        <Text size="sm" c="dimmed">
          Ovo je tehnička početna stranica. Ekrani aplikacije slede.
        </Text>
      </Stack>
    </Container>
  );
}
