import { Alert, Avatar, Button, Center, Container, Group, Loader, Stack, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconBallVolleyball, IconCalendarEvent, IconLogout } from '@tabler/icons-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { api, ApiError, errorMessage, roleLabels, type User } from './api/client';
import { AuthPage } from './auth/AuthPage';
import { Brand } from './components/Brand';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { usePolling } from './hooks/usePolling';

const AdminUsersPage = lazy(() => import('./admin/AdminUsersPage').then(({ AdminUsersPage }) => ({ default: AdminUsersPage })));
const TeamsPage = lazy(() => import('./teams/TeamsPage').then(({ TeamsPage }) => ({ default: TeamsPage })));
const MatchesPage = lazy(() => import('./matches/MatchesPage').then(({ MatchesPage }) => ({ default: MatchesPage })));

export function App() {
  return <AppErrorBoundary><Application /></AppErrorBoundary>;
}

function Application() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessionAttempt, setSessionAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setStartupError('');
    api.me(false, controller.signal).then((current) => { if (!controller.signal.aborted) setUser(current); })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) setUser(null);
        else setStartupError(errorMessage(failure));
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
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

  const session = usePolling(!!user && !logoutBusy, (user?.id ?? '') + ':' + user?.role + ':' + sessionAttempt,
    async (signal) => {
      const current = await api.me(true, signal);
      if (signal.aborted) return;
      if (current.id !== user?.id || current.role !== user?.role) {
        notifications.clean();
        setError('');
        setUser(current);
      }
    }, { intervalMs: 30_000, maxRetryDelayMs: 120_000, immediate: sessionAttempt > 0 });

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
    onLogin={(current) => { setUser(current); setNotice(''); setError(''); setSessionAttempt(0); }} />;

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
          {session.error && <Alert color="yellow" role="status" title="Provera sesije nije uspela">
            {session.error} Pristup nalogu trenutno nije ponovo potvrđen.
            <Button variant="light" size="xs" mt="sm" onClick={() => setSessionAttempt((value) => value + 1)}>Ponovi proveru sesije</Button>
          </Alert>}
          <Suspense fallback={<Center py="xl"><Loader aria-label="Učitavanje stranice" /></Center>}>
            {user.role === 'ADMIN' ? <AdminUsersPage key={user.id} /> : (
              <Tabs key={user.id + ':' + user.role} defaultValue="teams" keepMounted>
                <Tabs.List mb="xl" aria-label="Sekcije aplikacije" className="dashboard-navigation">
                  <Tabs.Tab value="teams" leftSection={<IconBallVolleyball size={18} aria-hidden="true" />}>Timovi i igrači</Tabs.Tab>
                  <Tabs.Tab value="matches" leftSection={<IconCalendarEvent size={18} aria-hidden="true" />}>Utakmice</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="teams"><TeamsPage canManage={user.role === 'STATISTICIAN'} /></Tabs.Panel>
                <Tabs.Panel value="matches"><MatchesPage canManage={user.role === 'STATISTICIAN'} /></Tabs.Panel>
              </Tabs>
            )}
          </Suspense>
        </Stack>
      </Container>
    </div>
  );
}
