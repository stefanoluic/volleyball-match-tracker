import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type User } from '../../src/api/client';
import { AuthPage } from '../../src/auth/AuthPage';
import { AdminUsersPage } from '../../src/admin/AdminUsersPage';
import { theme } from '../../src/theme';

const blocked: User = {
  id: 'blocked-user', firstName: 'Ana', lastName: 'Petrović', email: 'ana@example.com',
  role: 'COACH', status: 'BLOCKED', createdAt: '2026-10-08T10:00:00Z',
};

function renderScreen(children: ReactNode) {
  return render(<MantineProvider theme={theme} env="test">{children}</MantineProvider>);
}

function AuthHarness() {
  const [notice, setNotice] = useState('Sesija je istekla.');
  return <AuthPage notice={notice} onClearNotice={() => setNotice('')} onLogin={() => {}} />;
}

beforeEach(() => { vi.spyOn(notifications, 'show').mockReturnValue('test-notification'); });
afterEach(() => { vi.restoreAllMocks(); });

test('welcome content and both auth forms share one outer container', async () => {
  const user = userEvent.setup();
  const { container } = renderScreen(<AuthHarness />);
  const shell = container.querySelector('.auth-shell')!;
  expect(shell.querySelector('.auth-intro')).toBeTruthy();
  expect(shell.contains(screen.getByRole('button', { name: 'Prijavi se' }))).toBe(true);
  await user.click(screen.getByRole('tab', { name: 'Registracija' }));
  expect(shell.contains(screen.getByRole('button', { name: 'Pošalji zahtev za registraciju' }))).toBe(true);
  expect(container.querySelectorAll('.auth-shell')).toHaveLength(1);
});

test('switching to registration clears the old session notice', async () => {
  const user = userEvent.setup();
  renderScreen(<AuthHarness />);
  expect(screen.getByText('Sesija je istekla.')).toBeTruthy();
  await user.click(screen.getByRole('tab', { name: 'Registracija' }));
  expect(screen.queryByText('Sesija je istekla.')).toBeNull();
  expect(screen.getByLabelText(/^Ime/)).toBeTruthy();
});

test('a failed new login replaces the session notice with the current error', async () => {
  const user = userEvent.setup();
  const login = vi.spyOn(api, 'login').mockRejectedValue(new ApiError('Pogrešan mejl ili lozinka.', 401));
  renderScreen(<AuthHarness />);
  await user.type(screen.getByLabelText(/^Mejl/), 'user@example.com');
  await user.type(screen.getByLabelText(/^Lozinka/), 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Prijavi se' }));
  await screen.findByText('Pogrešan mejl ili lozinka.');
  expect(screen.queryByText('Sesija je istekla.')).toBeNull();
  expect(login).toHaveBeenCalledWith('user@example.com', 'wrong-password');
});

test('native invalid input also clears the old session notice', () => {
  renderScreen(<AuthHarness />);
  fireEvent.invalid(screen.getByLabelText(/^Mejl/));
  expect(screen.queryByText('Sesija je istekla.')).toBeNull();
});

test('invalid names keep normal text color and show errors without registering', async () => {
  const user = userEvent.setup();
  const register = vi.spyOn(api, 'register');
  renderScreen(<AuthHarness />);
  await user.click(screen.getByRole('tab', { name: 'Registracija' }));
  const firstName = screen.getByLabelText(/^Ime/) as HTMLInputElement;
  const lastName = screen.getByLabelText(/^Prezime/) as HTMLInputElement;
  await user.type(firstName, 'Ana2');
  await user.type(lastName, 'Petrović!');
  await user.type(screen.getByLabelText(/^Mejl/), 'ana@example.com');
  await user.type(screen.getByLabelText(/^Lozinka/), 'TestPassword123');
  await user.type(screen.getByLabelText(/^Potvrda lozinke/), 'TestPassword123');
  await user.click(screen.getByRole('button', { name: 'Pošalji zahtev za registraciju' }));
  expect(screen.getByText('Ime može da sadrži slova, uz razmak ili crticu između delova.')).toBeTruthy();
  expect(screen.getByText('Prezime može da sadrži slova, uz razmak ili crticu između delova.')).toBeTruthy();
  expect(firstName.style.color).toBe('var(--mantine-color-text)');
  expect(lastName.style.color).toBe('var(--mantine-color-text)');
  expect(firstName.getAttribute('aria-invalid')).toBe('true');
  expect(register).not.toHaveBeenCalled();
});

test('status tabs request the matching backend filter and expose a connected panel', async () => {
  const user = userEvent.setup();
  const users = vi.spyOn(api, 'users').mockResolvedValue({ content: [], page: 0, totalPages: 0, totalElements: 0 });
  renderScreen(<AdminUsersPage />);
  await screen.findByText('Nema zahteva na čekanju');
  const tab = screen.getByRole('tab', { name: 'Blokirani' });
  await user.click(tab);
  await waitFor(() => expect(users).toHaveBeenLastCalledWith('BLOCKED', 0, expect.any(AbortSignal)));
  expect(tab.getAttribute('aria-selected')).toBe('true');
  expect(document.getElementById(tab.getAttribute('aria-controls')!)).toBeTruthy();
});

test('deletion requires confirmation, can be cancelled, and refreshes after success', async () => {
  const user = userEvent.setup();
  const users = vi.spyOn(api, 'users').mockResolvedValue({ content: [blocked], page: 0, totalPages: 1, totalElements: 1 });
  const remove = vi.spyOn(api, 'deleteUser').mockResolvedValue();
  renderScreen(<AdminUsersPage />);
  const table = await screen.findByRole('table');
  await user.click(within(table).getByRole('button', { name: 'Obriši' }));
  let dialog = screen.getByRole('dialog', { name: 'Trajno brisanje naloga' });
  expect(within(dialog).getByText(/Brisanje nije moguće poništiti/)).toBeTruthy();
  expect(remove).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Odustani' }));
  expect(remove).not.toHaveBeenCalled();
  await user.click(within(table).getByRole('button', { name: 'Obriši' }));
  dialog = screen.getByRole('dialog', { name: 'Trajno brisanje naloga' });
  users.mockResolvedValue({ content: [], page: 0, totalPages: 0, totalElements: 0 });
  await user.click(within(dialog).getByRole('button', { name: 'Trajno obriši' }));
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(blocked.id));
  await screen.findByText('Nema zahteva na čekanju');
  expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Nalog je trajno obrisan', message: blocked.email, role: 'status',
  }));
});

test('pending accounts show approve and block but never delete', async () => {
  const user = userEvent.setup();
  const pending: User = { ...blocked, status: 'PENDING' };
  const users = vi.spyOn(api, 'users').mockResolvedValue({ content: [pending], page: 0, totalPages: 1, totalElements: 1 });
  const approve = vi.spyOn(api, 'approve').mockResolvedValue({ ...pending, status: 'ACTIVE' });
  renderScreen(<AdminUsersPage />);
  const table = await screen.findByRole('table');
  expect(within(table).queryByRole('button', { name: 'Obriši' })).toBeNull();
  expect(within(table).getByRole('button', { name: 'Blokiraj' }).getAttribute('data-variant')).toBe('light');
  users.mockResolvedValue({ content: [], page: 0, totalPages: 0, totalElements: 0 });
  await user.click(within(table).getByRole('button', { name: 'Odobri' }));
  await waitFor(() => expect(approve).toHaveBeenCalledExactlyOnceWith(pending.id));
  expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nalog je aktiviran' }));
});
