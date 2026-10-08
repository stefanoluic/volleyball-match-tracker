import { Alert, Avatar, Badge, Button, Center, Container, Group, Loader, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconBallVolleyball, IconLogout, IconShieldCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage, roleLabels, type User } from './api/client';
import { AuthPage } from './auth/AuthPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { Brand } from './components/Brand';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStartupError('');
    api.me(false).then((current) => { if (!cancelled) setUser(current); })
      .catch((failure) => {
        if (cancelled) return;
        if (failure instanceof ApiError && failure.status === 401) setUser(null);
        else setStartupError(errorMessage(failure));
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    function expire() {
      notifications.clean();
      setUser(null);
      setNotice('Sesija je istekla ili je pristup nalogu ukinut. Prijavite se ponovo ako je nalog aktivan.');
    }
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      void api.me().catch((failure) => {
        if (!(failure instanceof ApiError && failure.status === 401)) setError(errorMessage(failure));
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  async function logout() {
    setLogoutBusy(true);
    setError('');
    try {
      await api.logout();
      notifications.clean();
      setUser(null);
      setNotice('');
    } catch (failure) {
      if (!(failure instanceof ApiError && failure.status === 401)) setError(errorMessage(failure));
    } finally {
      setLogoutBusy(false);
    }
  }

  if (loading) return <Center mih="100vh"><Loader aria-label="Provera sesije" /></Center>;
  if (startupError) return (
    <Container size="xs" py="xl"><Stack><Alert color="red" role="alert">{startupError}</Alert>
      <Button onClick={() => setAttempt((value) => value + 1)}>Pokušaj ponovo</Button></Stack></Container>
  );
  if (!user) return <AuthPage notice={notice} onClearNotice={() => setNotice('')}
    onLogin={(current) => { setUser(current); setNotice(''); setError(''); }} />;

  return (
    <div className="dashboard">
      <header className="app-header">
        <Container size="lg"><Group justify="space-between" py="md">
          <Brand />
          <Group gap="md" className="header-account">
            <Avatar color="blue" radius="xl" size={38} aria-hidden="true">{user.firstName.charAt(0)}{user.lastName.charAt(0)}</Avatar>
            <div className="header-account-name"><Text size="sm" fw={600}>{user.firstName} {user.lastName}</Text><Text size="xs" c="dimmed">{roleLabels[user.role]}</Text></div>
            <Button variant="default" size="sm" leftSection={<IconLogout size={17} aria-hidden="true" />} onClick={() => void logout()} loading={logoutBusy}>Odjavi se</Button>
          </Group>
        </Group></Container>
      </header>
      <Container component="main" size="lg" py="xl">
        <Stack gap="lg">
          {error && <Alert color="red" icon={<IconAlertCircle size={19} />} role="alert" withCloseButton onClose={() => setError('')}>{error}</Alert>}
          {user.role === 'ADMIN' ? <AdminUsersPage /> : (
            <Paper withBorder p="xl" radius="lg"><Stack align="flex-start">
              <ThemeIcon color="blue" variant="light" size={58} radius="lg"><IconBallVolleyball size={32} aria-hidden="true" /></ThemeIcon>
              <Badge color="teal" variant="light" leftSection={<IconShieldCheck size={13} aria-hidden="true" />}>Aktivan nalog</Badge>
              <Title order={1} size="h2">Dobro došli, {user.firstName}.</Title>
              <Text c="dimmed">Prijavljeni ste kao: {roleLabels[user.role]}.</Text>
              <Text>Vaš nalog je odobren. Funkcionalnosti za praćenje utakmica dodajemo u narednim koracima.</Text>
            </Stack></Paper>
          )}
        </Stack>
      </Container>
    </div>
  );
}
