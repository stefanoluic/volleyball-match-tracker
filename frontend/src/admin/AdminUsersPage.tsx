import {
  Alert, Avatar, Badge, Button, Group, Modal, Pagination, Paper, Skeleton,
  Stack, Table, Tabs, Text, ThemeIcon, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle, IconBan, IconCheck, IconClock, IconRefresh,
  IconShieldCheck, IconTrash, IconUserCheck, IconUsers,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, errorMessage, roleLabels, statusLabels, type User, type UserPage } from '../api/client';

const statusColors = { PENDING: 'yellow', ACTIVE: 'teal', BLOCKED: 'red', REJECTED: 'gray' };
const filters = [
  { value: 'PENDING', label: 'Na čekanju', icon: IconClock },
  { value: 'ACTIVE', label: 'Aktivni', icon: IconUserCheck },
  { value: 'BLOCKED', label: 'Blokirani', icon: IconBan },
  { value: 'ALL', label: 'Svi', icon: IconUsers },
];
type AccountAction = 'approve' | 'block' | 'delete';

function UserIdentity({ user }: { user: User }) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Avatar color="blue" radius="xl" size={38} aria-hidden="true">
        {user.firstName.charAt(0)}{user.lastName.charAt(0)}
      </Avatar>
      <div className="user-identity">
        <Text fw={600} size="sm">{user.firstName} {user.lastName}</Text>
        <Text size="xs" c="dimmed">{user.email}</Text>
      </div>
    </Group>
  );
}

export function AdminUsersPage() {
  const [filter, setFilter] = useState('PENDING');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<UserPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<{ id: string; action: AccountAction } | null>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{ user: User; action: 'block' | 'delete' } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setError('');
    api.users(filter, page, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      if (page > 0 && data.content.length === 0) setPage(Math.max(0, data.totalPages - 1));
      else setResult(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [filter, page, refresh]);

  async function changeAccount(user: User, action: AccountAction) {
    if (busy) return;
    setBusy({ id: user.id, action });
    setError('');
    try {
      if (action === 'approve') await api.approve(user.id);
      else if (action === 'block') await api.block(user.id);
      else await api.deleteUser(user.id);
      notifications.show({
        title: { approve: 'Nalog je aktiviran', block: 'Nalog je blokiran',
          delete: 'Nalog je trajno obrisan' }[action],
        message: user.email,
        color: 'teal',
        icon: <IconCheck size={18} aria-hidden="true" />,
        autoClose: 4500,
        role: 'status',
      });
      setConfirmation(null);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(errorMessage(failure));
      setConfirmation(null);
    } finally {
      setBusy(null);
    }
  }

  function actions(user: User) {
    return (
      <Group gap="xs" wrap="wrap">
        {user.status !== 'ACTIVE' && <Button size="xs" variant="light" color="teal"
          leftSection={<IconCheck size={15} aria-hidden="true" />} disabled={busy !== null}
          loading={busy?.id === user.id && busy.action === 'approve'} onClick={() => void changeAccount(user, 'approve')}>
          {user.status === 'PENDING' ? 'Odobri' : 'Aktiviraj'}
        </Button>}
        {user.status !== 'BLOCKED'
          ? <Button size="xs" variant="light" color="red" leftSection={<IconBan size={15} aria-hidden="true" />}
              disabled={busy !== null} onClick={() => setConfirmation({ user, action: 'block' })}>Blokiraj</Button>
          : <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={15} aria-hidden="true" />}
              disabled={busy !== null} onClick={() => setConfirmation({ user, action: 'delete' })}>Obriši</Button>}
      </Group>
    );
  }

  function statusBadge(user: User) {
    return <Badge color={statusColors[user.status]} variant="light" radius="sm">{statusLabels[user.status]}</Badge>;
  }

  const deleting = confirmation?.action === 'delete';

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start" className="page-heading">
        <div>
          <Text size="xs" fw={700} c="blue.7" tt="uppercase" mb={8}>Administracija · Pristup timu</Text>
          <Title order={1} size="h2">Korisnički nalozi</Title>
          <Text c="dimmed" mt={8}>Odobrite nove članove i upravljajte pristupom aplikaciji.</Text>
        </div>
        <Badge variant="light" color="blue" size="lg" leftSection={<IconShieldCheck size={14} aria-hidden="true" />}>
          Administrator
        </Badge>
      </Group>
      {error && <Alert color="red" icon={<IconAlertCircle size={20} aria-hidden="true" />} role="alert"
        withCloseButton onClose={() => setError('')}>{error}</Alert>}
      <Paper withBorder radius="lg" className="accounts-panel">
        <Tabs value={filter} onChange={(value) => { if (value) { setFilter(value); setPage(0); } }}
          variant="pills" aria-label="Status naloga">
        <div className="accounts-toolbar">
            <Tabs.List className="status-tabs">
              {filters.map(({ value, label, icon: Icon }) => (
                <Tabs.Tab key={value} value={value} disabled={busy !== null}
                  leftSection={<Icon size={16} aria-hidden="true" />}>{label}</Tabs.Tab>
              ))}
            </Tabs.List>
          <Button variant="default" size="sm" leftSection={<IconRefresh size={16} aria-hidden="true" />}
            onClick={() => setRefresh((value) => value + 1)} disabled={loading || busy !== null}>Osveži</Button>
        </div>
        <Tabs.Panel value={filter}>
        <div className="accounts-content" aria-busy={loading}>
          {loading ? (
            <Stack gap="md" py="md" role="status" aria-label="Učitavanje naloga">
              <Text size="sm" c="dimmed">Učitavanje naloga…</Text>
              {Array.from({ length: 4 }, (_, index) => (
                <Group key={index} wrap="nowrap"><Skeleton height={38} width={38} circle />
                  <Stack gap={8} flex={1}><Skeleton height={12} width="45%" /><Skeleton height={9} width="65%" /></Stack>
                  <Skeleton height={26} width={85} />
                </Group>
              ))}
            </Stack>
          ) : result ? (
            result.content.length === 0 ? (
              <Stack gap="sm" align="center" py={52} className="empty-state">
                <ThemeIcon color="blue" variant="light" size={64} radius="xl">
                  <IconUsers size={30} stroke={1.5} aria-hidden="true" />
                </ThemeIcon>
                <Title order={2} size="h4" mt="sm">
                  {filter === 'PENDING' ? 'Nema zahteva na čekanju' : 'Nema naloga u ovom pregledu'}
                </Title>
                <Text c="dimmed" size="sm" ta="center" maw={360}>
                  {filter === 'PENDING' ? 'Nove registracije pojaviće se ovde kada korisnici pošalju zahtev.'
                    : 'Izaberite drugi status da biste videli ostale naloge.'}
                </Text>
              </Stack>
            ) : (
              <>
                <div className="accounts-desktop">
                  <Table.ScrollContainer minWidth={780}>
                    <Table verticalSpacing="lg" highlightOnHover className="accounts-table">
                      <Table.Thead><Table.Tr><Table.Th>Korisnik</Table.Th><Table.Th>Uloga</Table.Th>
                        <Table.Th>Status</Table.Th><Table.Th>Registrovan</Table.Th><Table.Th>Akcije</Table.Th></Table.Tr></Table.Thead>
                      <Table.Tbody>{result.content.map((user) => (
                        <Table.Tr key={user.id}>
                          <Table.Td><UserIdentity user={user} /></Table.Td>
                          <Table.Td><Text size="sm">{roleLabels[user.role]}</Text></Table.Td>
                          <Table.Td>{statusBadge(user)}</Table.Td>
                          <Table.Td><Text size="sm" c="dimmed">{new Date(user.createdAt).toLocaleDateString('sr-Latn-RS')}</Text></Table.Td>
                          <Table.Td>{actions(user)}</Table.Td>
                        </Table.Tr>
                      ))}</Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </div>
                <Stack gap="sm" className="accounts-mobile">
                  {result.content.map((user) => (
                    <Paper key={user.id} withBorder p="md" radius="md">
                      <Stack gap="md">
                        <UserIdentity user={user} />
                        <Group justify="space-between" gap="xs"><Text size="sm" c="dimmed">{roleLabels[user.role]}</Text>{statusBadge(user)}</Group>
                        <Text size="xs" c="dimmed">Registrovan: {new Date(user.createdAt).toLocaleDateString('sr-Latn-RS')}</Text>
                        {actions(user)}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </>
            )
          ) : <Button variant="light" onClick={() => setRefresh((value) => value + 1)}>Pokušaj ponovo</Button>}
        </div>
        {!loading && result && <Group justify="space-between" className="accounts-pagination">
          <Text size="sm" c="dimmed">Naloga u pregledu: <Text span fw={600} c="dark">{result.totalElements}</Text></Text>
          {result.totalPages > 1 && <Pagination total={result.totalPages} value={page + 1}
            onChange={(value) => setPage(value - 1)} disabled={busy !== null} size="sm" />}
        </Group>}
        </Tabs.Panel>
        </Tabs>
      </Paper>
      <Group gap="xs" wrap="nowrap" align="flex-start" className="admin-help">
        <IconShieldCheck size={18} aria-hidden="true" />
        <Text size="xs" c="dimmed">Administratorski nalozi nisu deo ove liste. Blokiranom korisniku pristup se ukida pri narednom zahtevu, čak i ako je već prijavljen.</Text>
      </Group>
      <Modal opened={confirmation !== null} onClose={() => { if (!busy) setConfirmation(null); }}
        title={deleting ? 'Trajno brisanje naloga' : 'Blokiranje naloga'} centered
        closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy}>
        <Stack gap="lg">
          <ThemeIcon color="red" variant="light" size={48} radius="xl">
            {deleting ? <IconTrash size={24} aria-hidden="true" /> : <IconBan size={24} aria-hidden="true" />}
          </ThemeIcon>
          <Text>{deleting ? 'Trajno obrisati blokirani nalog ' : 'Blokirati nalog '}
            <strong className="confirmation-email">{confirmation?.user.email}</strong>?</Text>
          {deleting ? (
            <>
              <Alert color="red" icon={<IconAlertCircle size={18} aria-hidden="true" />}>
                Podaci naloga i hash lozinke biće uklonjeni iz baze. Brisanje nije moguće poništiti.
              </Alert>
              <Text size="sm" c="dimmed">Korisnik može ponovo da se registruje sa istim mejlom. Novi nalog će čekati odobrenje.</Text>
            </>
          ) : <Text size="sm" c="dimmed">Korisnik neće moći da se prijavi niti nastavi da koristi postojeću sesiju. Nalog možete kasnije ponovo aktivirati.</Text>}
          <Group justify="flex-end">
            <Button variant="default" disabled={busy !== null} onClick={() => setConfirmation(null)}>Odustani</Button>
            <Button color="red" loading={busy !== null}
              leftSection={deleting ? <IconTrash size={17} aria-hidden="true" /> : <IconBan size={17} aria-hidden="true" />}
              onClick={() => { if (confirmation) void changeAccount(confirmation.user, confirmation.action); }}>
              {deleting ? 'Trajno obriši' : 'Potvrdi blokiranje'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
