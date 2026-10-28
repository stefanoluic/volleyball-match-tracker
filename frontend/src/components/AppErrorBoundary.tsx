import { Alert, Button, Container, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReload?: () => void;
}
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return <Container component="main" size="sm" py="xl">
      <Paper component="section" withBorder p="xl" radius="md" aria-labelledby="app-error-heading">
        <Stack gap="lg">
          <ThemeIcon color="red" variant="light" size={52} radius="xl" aria-hidden="true"><IconAlertCircle size={28} /></ThemeIcon>
          <Title order={1} size="h2" id="app-error-heading">Aplikacija nije mogla da se prikaže</Title>
          <Text c="dimmed" role="alert">Došlo je do greške pri učitavanju ili prikazu stranice. Proverite internet vezu i ponovo učitajte aplikaciju.</Text>
          <Alert color="yellow" title="Pre ponovnog unosa">
            Nesačuvani izbori mogu biti izgubljeni. Ako ste upravo slali podatke, posle učitavanja proverite da li su sačuvani pre nego što ponovite unos.
          </Alert>
          <Button w="fit-content" leftSection={<IconRefresh size={17} />} onClick={() => {
            // A full reload can fetch a missing chunk; resetting a rejected React.lazy
            // component alone would just throw its cached error again. Never auto-reload.
            if (this.props.onReload) this.props.onReload();
            else window.location.reload();
          }}>Ponovo učitaj aplikaciju</Button>
        </Stack>
      </Paper>
    </Container>;
  }
}
