import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { api, type CoachingAnalysis, type Match, type MatchStatistics } from '../../src/api/client';
import { CoachingRecommendations } from '../../src/matches/CoachingRecommendations';
import { MatchStatisticsPanel } from '../../src/matches/MatchStatisticsPanel';
import { theme } from '../../src/theme';

const ready: CoachingAnalysis = { availability: 'AVAILABLE', totalRallies: 20, unspecifiedRallies: 0,
  minimumRallies: 10, minimumDetailCoveragePercent: 80,
  teams: [{ teamId: 'home', name: 'Vojvodina', items: [{ code: 'RECORDED_ERRORS', title: 'Pregled zabeleženih grešaka',
    observation: '5 od 10 protivničkih poena potiče od zabeleženih grešaka ovog tima.', suggestion: 'Pregledajte te završne akcije pre taktičke odluke.', participantId: null }] },
  { teamId: 'away', name: 'Partizan', items: [] }] };
const wrap = (child: React.ReactNode) => <MantineProvider theme={theme} env="test">{child}</MantineProvider>;
afterEach(() => vi.restoreAllMocks());

test('insufficient sample shows evidence and threshold instead of advice, even if items were supplied', () => {
  render(wrap(<CoachingRecommendations analysis={{ ...ready, availability: 'INSUFFICIENT_DATA', totalRallies: 9 }} />));
  expect(screen.getByText(/Potrebno je najmanje 10 važećih poena/)).toBeTruthy();
  expect(screen.getByText(/U izabranom opsegu: 9 važećih poena/)).toBeTruthy();
  expect(screen.queryByText('Pregled zabeleženih grešaka')).toBeNull();
});
test('incomplete details explain the data coverage requirement, not a volleyball success rate', () => {
  render(wrap(<CoachingRecommendations analysis={{ ...ready, availability: 'INCOMPLETE_DETAILS', unspecifiedRallies: 5 }} />));
  expect(screen.getByText(/najmanje 80% poena sa detaljima/)).toBeTruthy();
  expect(screen.queryByText('Pregled zabeleženih grešaka')).toBeNull();
});
test('available recommendations show team, factual evidence and review suggestion with limits', () => {
  render(wrap(<CoachingRecommendations analysis={ready} />));
  expect(screen.getByRole('region', { name: 'Preporuke · Vojvodina' })).toBeTruthy();
  expect(screen.getByText('5 od 10 protivničkih poena potiče od zabeleženih grešaka ovog tima.')).toBeTruthy();
  expect(screen.getByText('Pregledajte te završne akcije pre taktičke odluke.')).toBeTruthy();
  expect(screen.getByText(/ne odbojkaški standard niti dokaz uzroka problema/)).toBeTruthy();
  expect(screen.getByText(/bez AI modela/)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
test('no triggered pattern is distinguished from insufficient data and does not declare good performance', () => {
  render(wrap(<CoachingRecommendations analysis={{ ...ready, teams: ready.teams.map(team => ({ ...team, items: [] })) }} />));
  expect(screen.getAllByText('Nema izdvojenih obrazaca prema postavljenim pravilima. To ne znači da tim nema problema u igri.')).toHaveLength(2);
  expect(screen.queryByText(/Još nema dovoljno/)).toBeNull();
});
test('updated insufficient data removes an older recommendation rather than retaining stale advice', () => {
  const view = render(wrap(<CoachingRecommendations analysis={ready} />));
  view.rerender(wrap(<CoachingRecommendations analysis={{ ...ready, availability: 'INSUFFICIENT_DATA', totalRallies: 9, teams: [] }} />));
  expect(screen.queryByText('Pregled zabeleženih grešaka')).toBeNull();
});

test('statistics refresh updates recommendations in the same request and hides them while loading', async () => {
  const home = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-18T12:00:00Z' };
  const match: Match = { id: 'match', homeTeam: home, awayTeam: { ...home, id: 'away', name: 'Partizan' }, status: 'LIVE',
    scheduledAt: home.createdAt, createdAt: home.createdAt };
  const totals = { totalPoints: 10, attackPoints: 5, blockPoints: 0, serviceAces: 0, opponentErrors: 5, unspecifiedPoints: 0,
    errors: 5, unattributedErrors: 5, players: [] };
  const result: MatchStatistics = { matchId: match.id, setId: null, matchStatus: 'LIVE', sets: [],
    home: { ...totals, teamId: 'home', name: home.name }, away: { ...totals, teamId: 'away', name: 'Partizan' }, analysis: ready };
  let resolve!: (data: MatchStatistics) => void;
  const read = vi.spyOn(api, 'matchStatistics').mockResolvedValueOnce(result).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  render(wrap(<MatchStatisticsPanel match={match} revision="1" disabled={false} />));
  fireEvent.click(screen.getByRole('button', { name: 'Prikaži statistiku' }));
  await screen.findByText('Pregled zabeleženih grešaka');
  fireEvent.click(screen.getByRole('button', { name: 'Osveži statistiku' }));
  expect(screen.queryByText('Pregled zabeleženih grešaka')).toBeNull();
  await act(async () => resolve({ ...result, analysis: { ...ready, availability: 'INSUFFICIENT_DATA', totalRallies: 9, teams: [] } }));
  await screen.findByText(/Potrebno je najmanje 10 važećih poena/);
  expect(screen.queryByText('Pregled zabeleženih grešaka')).toBeNull();
  expect(read).toHaveBeenCalledTimes(2);
});
