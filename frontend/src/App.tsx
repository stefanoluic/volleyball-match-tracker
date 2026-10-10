import { Alert, Avatar, Button, Center, Container, Group, Loader, Stack, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconLogout } from '@tabler/icons-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { api, ApiError, errorMessage, roleLabels, type User } from './api/client';
import { AuthPage } from './auth/AuthPage';
import { Brand } from './components/Brand';

const AdminUsersPage = lazy(() => import('./admin/AdminUsersPage').then(({ AdminUsersPage }) => ({ default: AdminUsersPage })));
const TeamsPage = lazy(() => import('./teams/TeamsPage').then(({ TeamsPage }) => ({ default: TeamsPage })));
const MatchesPage = lazy(() => import('./matches/MatchesPage').then(({ MatchesPage }) => ({ default: MatchesPage })));

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
          <Suspense fallback={<Center py="xl"><Loader aria-label="Učitavanje stranice" /></Center>}>
            {user.role === 'ADMIN' ? <AdminUsersPage /> : (
              <Tabs defaultValue="teams" keepMounted>
                <Tabs.List mb="xl" aria-label="Sekcije aplikacije">
                  <Tabs.Tab value="teams">Timovi i igrači</Tabs.Tab>
                  <Tabs.Tab value="matches">Utakmice</Tabs.Tab>
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
