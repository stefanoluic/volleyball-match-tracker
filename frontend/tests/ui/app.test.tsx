import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App';
import { api, type UserRole } from '../../src/api/client';
import { theme } from '../../src/theme';

afterEach(() => vi.restoreAllMocks());

function mockAccount(role: UserRole) {
  vi.spyOn(api, 'me').mockResolvedValue({
    id: 'logged-in-user', firstName: 'Test', lastName: 'User', email: 'test@example.com',
    role, status: 'ACTIVE', createdAt: '2026-10-08T10:00:00Z',
  });
  vi.spyOn(api, 'teams').mockResolvedValue({ content: [], page: 0, totalPages: 0, totalElements: 0 });
  vi.spyOn(api, 'users').mockResolvedValue({ content: [], page: 0, totalPages: 0, totalElements: 0 });
}

test.each(['ADMIN', 'STATISTICIAN', 'COACH'] as const)('signed-in %s receives the correct screen and controls', async (role) => {
  mockAccount(role);
  render(<MantineProvider theme={theme} env="test"><App /></MantineProvider>);
  const heading = role === 'ADMIN' ? 'Korisnički nalozi' : 'Timovi';
  await screen.findByRole('heading', { name: heading, level: 1 });
  if (role === 'ADMIN') {
    await waitFor(() => expect(api.users).toHaveBeenCalled());
    expect(api.teams).not.toHaveBeenCalled();
  } else {
    await waitFor(() => expect(api.teams).toHaveBeenCalled());
    expect(api.users).not.toHaveBeenCalled();
    if (role === 'STATISTICIAN') expect(screen.getByRole('button', { name: 'Dodaj tim' })).toBeTruthy();
    else expect(screen.queryByRole('button', { name: 'Dodaj tim' })).toBeNull();
  }
});

test('session expiry leaves the team screen and returns to authentication', async () => {
  mockAccount('STATISTICIAN');
  render(<MantineProvider theme={theme} env="test"><App /></MantineProvider>);
  await screen.findByRole('heading', { name: 'Timovi', level: 1 });
  act(() => window.dispatchEvent(new Event('session-expired')));
  await screen.findByRole('button', { name: 'Prijavi se' });
  expect(screen.queryByRole('heading', { name: 'Timovi', level: 1 })).toBeNull();
  expect(screen.getByText(/Sesija je istekla ili je pristup nalogu ukinut/)).toBeTruthy();
});
