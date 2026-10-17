import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointPlayerOptions } from '../src/matches/pointDetails.ts';

const player = (teamId, n, isLibero = false) => ({ id: teamId + n, teamId, isLibero });
const home = Array.from({ length: 6 }, (_, i) => ({ rotationPosition: i + 1, participant: player('home', i + 1, i === 4) }));
const away = Array.from({ length: 6 }, (_, i) => ({ rotationPosition: i + 1, participant: player('away', i + 1) }));
const match = { homeTeam: { id: 'home' }, awayTeam: { id: 'away' } };
const score = { court: { servingTeamId: 'home', server: home[0].participant, homeLineup: home, awayLineup: away } };

test('attacks use the current scoring six, including a libero whose legal low attack is not excluded', () => {
  assert.deepEqual(pointPlayerOptions(match, score, 'home', 'ATTACK'), home.map(row => row.participant));
});
test('errors use opponent six, reversing direction for either scoring team', () => {
  assert.deepEqual(pointPlayerOptions(match, score, 'home', 'OPPONENT_ERROR'), away.map(row => row.participant));
  assert.deepEqual(pointPlayerOptions(match, score, 'away', 'OPPONENT_ERROR'), home.map(row => row.participant));
});
test('ace offers only the current server and no receiving player', () => {
  assert.deepEqual(pointPlayerOptions(match, score, 'home', 'SERVICE_ACE'), [home[0].participant]);
  assert.deepEqual(pointPlayerOptions(match, score, 'away', 'SERVICE_ACE'), []);
});
test('blocks offer only front row non-liberos by rotation, not primary player position', () => {
  assert.deepEqual(pointPlayerOptions(match, score, 'home', 'BLOCK').map(p => p.id), ['home2', 'home3', 'home4']);
  const withLibero = { court: { ...score.court, homeLineup: home.map(row => row.rotationPosition === 2
    ? { ...row, participant: { ...row.participant, isLibero: true } } : row) } };
  assert.deepEqual(pointPlayerOptions(match, withLibero, 'home', 'BLOCK').map(p => p.id), ['home3', 'home4']);
});
test('missing court or unclassified points never invent an individual', () => {
  assert.deepEqual(pointPlayerOptions(match, { court: null }, 'home', 'ATTACK'), []);
  assert.deepEqual(pointPlayerOptions(match, score, 'home', 'UNSPECIFIED'), []);
});
