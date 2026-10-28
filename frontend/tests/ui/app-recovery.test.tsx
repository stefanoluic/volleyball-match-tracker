import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { lazy, Suspense } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App';
import { api } from '../../src/api/client';
import { AppErrorBoundary } from '../../src/components/AppErrorBoundary';

vi.mock('../../src/teams/TeamsPage', () => ({ TeamsPage: () => { throw new Error('Simulated render failure'); } }));
vi.mock('../../src/matches/MatchesPage', () => ({ MatchesPage: () => null }));

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

function BrokenPage(): never { throw new Error('Sensitive diagnostic value'); }

test('healthy children render without a recovery screen', () => {
  render(<MantineProvider env="test"><AppErrorBoundary><div>Working screen</div></AppErrorBoundary></MantineProvider>);
  expect(screen.getByText('Working screen')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Ponovo učitaj aplikaciju' })).toBeNull();
});

test('render errors show a generic recovery screen and reload only after an explicit click', () => {
  const reload = vi.fn();
  render(<MantineProvider env="test"><AppErrorBoundary onReload={reload}><BrokenPage /></AppErrorBoundary></MantineProvider>);
  expect(screen.getByRole('heading', { name: 'Aplikacija nije mogla da se prikaže', level: 1 })).toBeTruthy();
  expect(screen.queryByText('Sensitive diagnostic value')).toBeNull();
  expect(screen.getByText(/proverite da li su sačuvani/)).toBeTruthy();
  expect(reload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ponovo učitaj aplikaciju' }));
  expect(reload).toHaveBeenCalledTimes(1);
});

test('rejected lazy imports leave a recovery screen instead of an empty root', async () => {
  const UnavailablePage = lazy(() => Promise.reject(new Error('Simulated missing JavaScript chunk')));
  render(<MantineProvider env="test"><AppErrorBoundary><Suspense fallback={<div>Loading page</div>}>
    <UnavailablePage />
  </Suspense></AppErrorBoundary></MantineProvider>);
  await screen.findByRole('heading', { name: 'Aplikacija nije mogla da se prikaže' });
  expect(screen.queryByText('Loading page')).toBeNull();
  expect(screen.getByRole('button', { name: 'Ponovo učitaj aplikaciju' })).toBeTruthy();
  expect(screen.queryByText('Simulated missing JavaScript chunk')).toBeNull();
});

test('the actual App wraps its lazy pages with the recovery boundary', async () => {
  vi.spyOn(api, 'me').mockResolvedValue({ id: 'user', firstName: 'Test', lastName: 'User', email: 'test@example.com',
    role: 'STATISTICIAN', status: 'ACTIVE', createdAt: '2026-10-28T12:00:00Z' });
  render(<MantineProvider env="test"><App /></MantineProvider>);
  await screen.findByRole('heading', { name: 'Aplikacija nije mogla da se prikaže' });
  expect(screen.queryByText('Simulated render failure')).toBeNull();
});
