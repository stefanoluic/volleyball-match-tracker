import {
  Alert, Badge, Button, Group, PasswordInput, Select, SimpleGrid,
  Stack, Tabs, Text, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { IconAlertCircle, IconArrowRight, IconChartBar, IconCheck, IconClipboardList, IconClock, IconLock, IconLogin, IconMail, IconShieldCheck, IconUserPlus } from '@tabler/icons-react';
import { api, ApiError, errorMessage, type Registration, type User } from '../api/client';
import { normalizeName, validateEmail, validateName } from './validation';
import { Brand } from '../components/Brand';
import { CourtIllustration } from '../components/CourtIllustration';

interface Props {
  onLogin: (user: User) => void;
  notice: string;
  onClearNotice: () => void;
}

const emptyRegistration: Registration = {
  firstName: '', lastName: '', email: '', password: '', confirmPassword: '', role: 'STATISTICIAN',
};

const nameInputStyles = { input: { color: 'var(--mantine-color-text)' } };

export function AuthPage({ onLogin, notice, onClearNotice }: Props) {
  const [tab, setTab] = useState<string | null>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registration, setRegistration] = useState<Registration>(emptyRegistration);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [registered, setRegistered] = useState(false);

  function switchTab(value: string | null) {
    onClearNotice();
    setTab(value);
    setError('');
    setFields({});
    setPassword('');
    setRegistration((current) => ({ ...current, password: '', confirmPassword: '' }));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    onClearNotice();
    setError('');
    setFields({});
    const emailError = validateEmail(email);
    if (emailError) {
      setFields({ email: emailError });
      return;
    }
    setBusy(true);
    try {
      const user = await api.login(email, password);
      setPassword('');
      onLogin(user);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    onClearNotice();
    setError('');
    setFields({});
    const validationErrors: Record<string, string> = {};
    const firstNameError = validateName(registration.firstName, 'Ime');
    const lastNameError = validateName(registration.lastName, 'Prezime');
    const emailError = validateEmail(registration.email);
    if (firstNameError) validationErrors.firstName = firstNameError;
    if (lastNameError) validationErrors.lastName = lastNameError;
    if (emailError) validationErrors.email = emailError;
    if (registration.password !== registration.confirmPassword) {
      validationErrors.confirmPassword = 'Lozinke se ne podudaraju.';
    }
    if (Object.keys(validationErrors).length > 0) {
      setFields(validationErrors);
      return;
    }
    setBusy(true);
    try {
      await api.register({ ...registration, email: registration.email.trim(),
        firstName: normalizeName(registration.firstName), lastName: normalizeName(registration.lastName) });
      setEmail(registration.email.trim());
      setRegistration({ ...emptyRegistration });
      setRegistered(true);
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError) setFields(failure.fields);
    } finally {
      setBusy(false);
    }
  }

  const update = (key: keyof Registration, value: string) =>
    setRegistration((current) => ({ ...current, [key]: value }));

  return (
    <main className="auth-layout">
      <div className="auth-shell">
      <section className="auth-intro" aria-labelledby="welcome-heading">
        <Brand />
        <div className="intro-copy">
          <Badge variant="outline" color="cyan.2" size="lg">Za tim i stručni štab</Badge>
          <Title id="welcome-heading" order={1}>Dobro došli<br />u tim.</Title>
          <Text size="lg" className="intro-description">Zajednički prostor za statističare i stručni štab.</Text>
          <Stack gap="lg" mt="xl" className="intro-roles">
            <Group wrap="nowrap" align="flex-start">
              <ThemeIcon color="cyan.2" variant="outline" size="lg"><IconClipboardList size={20} aria-hidden="true" /></ThemeIcon>
              <div><Text fw={600}>Statističar</Text><Text size="sm" className="intro-description">Beleženje događaja tokom utakmice.</Text></div>
            </Group>
            <Group wrap="nowrap" align="flex-start">
              <ThemeIcon color="cyan.2" variant="outline" size="lg"><IconChartBar size={20} aria-hidden="true" /></ThemeIcon>
              <div><Text fw={600}>Stručni štab</Text><Text size="sm" className="intro-description">Praćenje statistike i performansi.</Text></div>
            </Group>
          </Stack>
        </div>
        <CourtIllustration />
        <Group gap="xs" className="intro-footer" wrap="nowrap"><IconShieldCheck size={18} aria-hidden="true" />
          <Text size="sm">Pristup timu uz odobrenje administratora.</Text></Group>
      </section>

      <section className="auth-form-area" aria-label="Pristup aplikaciji">
        <div className="auth-card">
          {registered ? (
            <Stack gap="lg">
              <ThemeIcon color="teal" variant="light" size={56} radius="xl"><IconCheck size={28} aria-hidden="true" /></ThemeIcon>
              <Badge color="teal" variant="light">Zahtev je poslat</Badge>
              <Title order={2}>Registracija je uspešna.</Title>
              <Text c="dimmed">Vaš nalog čeka odobrenje administratora. Dok ne bude odobren, prijava nije moguća.</Text>
              <Button rightSection={<IconArrowRight size={18} aria-hidden="true" />} onClick={() => { setRegistered(false); switchTab('login'); }}>Nazad na prijavu</Button>
            </Stack>
          ) : (
            <Tabs value={tab} onChange={switchTab} keepMounted={false}>
              <Tabs.List grow mb="xl">
                <Tabs.Tab value="login" leftSection={<IconLogin size={17} aria-hidden="true" />} disabled={busy}>Prijava</Tabs.Tab>
                <Tabs.Tab value="register" leftSection={<IconUserPlus size={17} aria-hidden="true" />} disabled={busy}>Registracija</Tabs.Tab>
              </Tabs.List>
              {notice && <Alert color="yellow" icon={<IconClock size={19} />} mb="lg" role="status">{notice}</Alert>}
              {error && <Alert color="red" icon={<IconAlertCircle size={19} />} mb="lg" role="alert">{error}</Alert>}
              <Tabs.Panel value="login">
                <form onSubmit={login} onInvalid={onClearNotice}>
                  <Stack gap="md">
                    <div><Title order={2}>Prijavite se</Title><Text c="dimmed" size="sm" mt={4}>Unesite podatke svog odobrenog naloga.</Text></div>
                    <TextInput label="Mejl" placeholder="ime@primer.com" type="email" autoComplete="username"
                      leftSection={<IconMail size={18} aria-hidden="true" />}
                      required maxLength={254} value={email} onChange={(event) => setEmail(event.currentTarget.value)}
                      error={fields.email} disabled={busy} />
                    <PasswordInput label="Lozinka" autoComplete="current-password" required maxLength={128}
                      leftSection={<IconLock size={18} aria-hidden="true" />}
                      value={password} onChange={(event) => setPassword(event.currentTarget.value)} disabled={busy} />
                    <Button type="submit" fullWidth size="md" rightSection={<IconArrowRight size={18} aria-hidden="true" />} loading={busy} mt="sm">Prijavi se</Button>
                    <Text size="xs" c="dimmed">Ako ste se tek registrovali, sačekajte odobrenje administratora.</Text>
                  </Stack>
                </form>
              </Tabs.Panel>
              <Tabs.Panel value="register">
                <form onSubmit={register} onInvalid={onClearNotice}>
                  <Stack gap="md">
                    <div><Title order={2}>Napravite nalog</Title><Text c="dimmed" size="sm" mt={4}>Izaberite ulogu koju ćete imati u timu.</Text></div>
                    <SimpleGrid cols={{ base: 1, xs: 2 }}>
                      <TextInput label="Ime" autoComplete="given-name" required maxLength={100} styles={nameInputStyles} value={registration.firstName}
                        onChange={(event) => update('firstName', event.currentTarget.value)} error={fields.firstName} disabled={busy} />
                      <TextInput label="Prezime" autoComplete="family-name" required maxLength={100} styles={nameInputStyles} value={registration.lastName}
                        onChange={(event) => update('lastName', event.currentTarget.value)} error={fields.lastName} disabled={busy} />
                    </SimpleGrid>
                    <TextInput label="Mejl" type="email" autoComplete="username" required maxLength={254} value={registration.email}
                      placeholder="ime@primer.com" leftSection={<IconMail size={18} aria-hidden="true" />}
                      onChange={(event) => update('email', event.currentTarget.value)} error={fields.email} disabled={busy} />
                    <Select label="Uloga" required allowDeselect={false} value={registration.role}
                      data={[{ value: 'STATISTICIAN', label: 'Statističar' }, { value: 'COACH', label: 'Stručni štab' }]}
                      onChange={(value) => { if (value) update('role', value); }} error={fields.role} disabled={busy} />
                    <PasswordInput label="Lozinka" description="Od 8 do 128 znakova." autoComplete="new-password"
                      required minLength={8} maxLength={128} value={registration.password}
                      onChange={(event) => update('password', event.currentTarget.value)} error={fields.password} disabled={busy} />
                    <PasswordInput label="Potvrda lozinke" autoComplete="new-password" required maxLength={128}
                      value={registration.confirmPassword} onChange={(event) => update('confirmPassword', event.currentTarget.value)}
                      error={fields.confirmPassword} disabled={busy} />
                    <Button type="submit" fullWidth size="md" leftSection={<IconUserPlus size={18} aria-hidden="true" />} loading={busy} mt="sm">Pošalji zahtev za registraciju</Button>
                    <Text size="xs" c="dimmed">Registracija ne daje pristup dok administrator ne odobri nalog.</Text>
                  </Stack>
                </form>
              </Tabs.Panel>
            </Tabs>
          )}
        </div>
      </section>
      </div>
    </main>
  );
}
