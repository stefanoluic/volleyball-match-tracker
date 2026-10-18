import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPlayer, type MatchSet, type MatchStatistics, type SetScore, type TeamStatistics } from '../../src/api/client';
import { MatchStatisticsPanel } from '../../src/matches/MatchStatisticsPanel';
import { MatchScoreboard } from '../../src/matches/MatchScoreboard';
import { theme } from '../../src/theme';

const home = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-16T12:00:00Z' };
const away = { ...home, id: 'away', name: 'Partizan' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'LIVE', scheduledAt: home.createdAt, createdAt: home.createdAt };
function player(teamId: string, n: number): MatchPlayer {
  return { id: teamId+n, playerId: teamId+'-player'+n, teamId, firstName: teamId==='home' ? 'Marko' : 'Petar',
    lastName: 'Marković', jerseyNumber: n, position: n===8 ? 'LIBERO' : 'SETTER', isLibero: n===8 };
}
function team(teamId: string, name: string): TeamStatistics {
  return { teamId, name, totalPoints: 0, attackPoints: 0, blockPoints: 0, serviceAces: 0, opponentErrors: 0,
    unspecifiedPoints: 0, errors: 0, unattributedErrors: 0,
    players: [1,3,8].map(n=>({ participant: player(teamId,n), attackPoints: 0, blockPoints: 0, serviceAces: 0, scoringPoints: 0, errors: 0 })) };
}
const empty: MatchStatistics = { matchId: match.id, setId: null, matchStatus: 'LIVE',
  analysis: { availability: 'INSUFFICIENT_DATA', totalRallies: 0, unspecifiedRallies: 0, minimumRallies: 10, minimumDetailCoveragePercent: 80, teams: [] },
  sets: [{ id: 'set1', number: 1, status: 'FINISHED', scoreVersion: 28 }, { id: 'set2', number: 2, status: 'LIVE', scoreVersion: 1 }],
  home: team(home.id,home.name), away: team(away.id,away.name) };
const filled: MatchStatistics = { ...empty,
  home: { ...empty.home, totalPoints: 8, attackPoints: 2, blockPoints: 1, serviceAces: 1, opponentErrors: 3, unspecifiedPoints: 1, errors: 1,
    players: empty.home.players.map((row,i)=>i===0 ? {...row,serviceAces:1,scoringPoints:1} : i===1 ? {...row,attackPoints:2,blockPoints:1,scoringPoints:3,errors:1} : row) },
  away: { ...empty.away, totalPoints: 2, attackPoints: 1, opponentErrors: 1, errors: 3, unattributedErrors: 1 } };
beforeEach(()=>{ vi.spyOn(api,'matchStatistics').mockResolvedValue(filled); });
afterEach(()=>vi.restoreAllMocks());
function panel(revision='set1:1', disabled=false) {
  return <MantineProvider theme={theme} env="test"><MatchStatisticsPanel match={match} revision={revision} disabled={disabled}/></MantineProvider>;
}
async function open() {
  fireEvent.click(screen.getByRole('button',{name:'Prikaži statistiku'}));
  return screen.findByRole('table',{name:'Pregled timova'});
}
async function scope(option: string) {
  fireEvent.click(screen.getByRole('combobox',{name:'Opseg statistike'}));
  fireEvent.click(await screen.findByRole('option',{name:option}));
}
function cells(table: HTMLElement, label: string) {
  const row=within(table).getByRole('row',{name:new RegExp('^'+label+' ')});
  return within(row).getAllByRole('cell').map(cell=>cell.textContent);
}

test('statistics loads only when expanded and shows team counts and real player scoring totals separately',async()=>{
  render(panel()); expect(api.matchStatistics).not.toHaveBeenCalled();
  const table=await open();
  expect(api.matchStatistics).toHaveBeenCalledExactlyOnceWith(match.id,null,expect.any(AbortSignal));
  expect(cells(table,'Ukupno poena')).toEqual(['8','2']);
  expect(cells(table,'Poeni napadom')).toEqual(['2','1']);
  expect(cells(table,'Poeni greškom protivnika')).toEqual(['3','1']);
  expect(cells(table,'Poeni bez detalja')).toEqual(['1','0']);
  expect(cells(table,'Zabeležene greške za poen protivnika')).toEqual(['1','3']);
  expect(cells(table,'Od toga nepripisane igraču')).toEqual(['0','1']);
  const playerTable=screen.getByRole('table',{name:'Učinak igrača · Vojvodina'});
  expect(cells(playerTable,'#3 Marko Marković')).toEqual(['2','1','0','3','1']);
  expect(cells(playerTable,'#8 Marko Marković')).toEqual(['0','0','0','0','0']);
  expect(screen.getByText(/Ne računamo procente uspešnosti/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Sakrij statistiku'}));
  expect(screen.queryByRole('table')).toBeNull();
});
test('no-points state keeps zeros and does not claim that zero-stat players never played',async()=>{
  vi.mocked(api.matchStatistics).mockResolvedValue(empty);
  render(panel()); const table=await open();
  expect(cells(table,'Ukupno poena')).toEqual(['0','0']);
  expect(screen.getByText('U izabranom opsegu još nema važećih poena.')).toBeTruthy();
  expect(screen.getByText(/Nula ne znači da igrač nije igrao/)).toBeTruthy();
});
test('scope change fetches selected set and hides whole-match numbers while that set is loading',async()=>{
  let resolve!: (data: MatchStatistics)=>void;
  vi.mocked(api.matchStatistics).mockResolvedValueOnce(filled).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  render(panel()); await open(); await scope('Set 1 · Završen');
  expect(api.matchStatistics).toHaveBeenLastCalledWith(match.id,'set1',expect.any(AbortSignal));
  expect(screen.queryByRole('table',{name:'Pregled timova'})).toBeNull();
  await act(async()=>resolve({...empty,setId:'set1',home:{...empty.home,totalPoints:1,unspecifiedPoints:1}}));
  const table=await screen.findByRole('table',{name:'Pregled timova'});
  expect(cells(table,'Ukupno poena')).toEqual(['1','0']);
  await scope('Cela utakmica');
  expect(api.matchStatistics).toHaveBeenLastCalledWith(match.id,null,expect.any(AbortSignal));
});
test('late response from an aborted scope request cannot replace the newest selection',async()=>{
  let oldResolve!: (data: MatchStatistics)=>void;
  vi.mocked(api.matchStatistics).mockResolvedValueOnce(filled)
    .mockReturnValueOnce(new Promise(done=>{oldResolve=done;}))
    .mockResolvedValueOnce({...filled,home:{...filled.home,totalPoints:9,unspecifiedPoints:2}});
  render(panel()); await open(); await scope('Set 1 · Završen');
  const oldSignal=vi.mocked(api.matchStatistics).mock.calls[1][2]!;
  await scope('Cela utakmica');
  await screen.findByText('9 poena'); expect(oldSignal.aborted).toBe(true);
  await act(async()=>oldResolve({...empty,setId:'set1'}));
  expect(screen.getByText('9 poena')).toBeTruthy();
});
test('failed refresh hides previous numbers and can recover without changing scope',async()=>{
  vi.mocked(api.matchStatistics).mockResolvedValueOnce(filled).mockRejectedValueOnce(new ApiError('Statistika nije dostupna.',503)).mockResolvedValue(empty);
  render(panel()); await open(); fireEvent.click(screen.getByRole('button',{name:'Osveži statistiku'}));
  await screen.findByText('Statistika nije dostupna.'); expect(screen.queryByRole('table')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Osveži statistiku'}));
  const table=await screen.findByRole('table',{name:'Pregled timova'});
  expect(cells(table,'Ukupno poena')).toEqual(['0','0']);
  expect(api.matchStatistics).toHaveBeenCalledTimes(3);
});
test('local score revision reloads statistics, never leaving old counts labelled as current',async()=>{
  let resolve!: (data: MatchStatistics)=>void;
  vi.mocked(api.matchStatistics).mockResolvedValueOnce(filled).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  const view=render(panel()); await open(); view.rerender(panel('set1:2'));
  expect(screen.queryByRole('table',{name:'Pregled timova'})).toBeNull();
  await act(async()=>resolve(empty));
  expect(cells(await screen.findByRole('table',{name:'Pregled timova'}),'Ukupno poena')).toEqual(['0','0']);
});
test('open write draft or uncertain score hides statistics and defers reads until unblocked',async()=>{
  const view=render(panel()); await open(); view.rerender(panel('set1:1',true));
  expect(screen.queryByRole('table')).toBeNull(); expect(api.matchStatistics).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button',{name:'Osveži statistiku'}) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(panel('set1:2',false));
  await screen.findByRole('table',{name:'Pregled timova'}); expect(api.matchStatistics).toHaveBeenCalledTimes(2);
});
test('unmount aborts pending reads',async()=>{
  vi.mocked(api.matchStatistics).mockImplementation((_match,_set,signal)=>new Promise((_resolve,reject)=>{
    signal?.addEventListener('abort',()=>reject(new Error('aborted')));
  }));
  const view=render(panel()); fireEvent.click(screen.getByRole('button',{name:'Prikaži statistiku'}));
  await waitFor(()=>expect(api.matchStatistics).toHaveBeenCalledTimes(1));
  const signal=vi.mocked(api.matchStatistics).mock.calls[0][2]!;
  view.unmount(); expect(signal.aborted).toBe(true);
});
test('empty rosters and a finished match have readable statistics without write controls',async()=>{
  vi.mocked(api.matchStatistics).mockResolvedValue({...empty,matchStatus:'FINISHED',home:{...empty.home,players:[]},away:{...empty.away,players:[]}});
  render(panel()); await open(); expect(screen.getAllByText('Nema prijavljenih igrača.')).toHaveLength(2);
  expect(screen.queryByRole('button',{name:'Potvrdi poen'})).toBeNull();
});

const set: MatchSet={id:'set1',number:1,status:'LIVE',homeScore:0,awayScore:0,firstServingTeamId:home.id,
  startedAt:home.createdAt,homeLineup:[],awayLineup:[],scoreVersion:0,finishedAt:null,winnerTeamId:null};
const zeroScore: SetScore={setId:set.id,version:0,homeScore:0,awayScore:0,matchStatus:'LIVE',setStatus:'LIVE',canRecord:true,
  lastActivePoint:null,points:[],canUndo:false,canFinish:false,winnerTeamId:null,court:null,libero:null,substitutions:null};
test('scoreboard refreshes expanded statistics after both point addition and undo',async()=>{
  vi.spyOn(notifications,'show').mockReturnValue('notice');
  vi.spyOn(api,'setScore').mockResolvedValue(zeroScore);
  const point={id:'point',sequenceNumber:1,scoringTeamId:home.id,homeScoreAfter:1,awayScoreAfter:0,createdAt:home.createdAt,
    cancelledAt:null,actionType:'UNSPECIFIED' as const,participant:null};
  vi.spyOn(api,'addPoint').mockResolvedValue({...zeroScore,version:1,homeScore:1,canUndo:true,lastActivePoint:point,points:[point]});
  vi.spyOn(api,'undoPoint').mockResolvedValue({...zeroScore,version:2,points:[{...point,cancelledAt:home.createdAt}]});
  vi.mocked(api.matchStatistics).mockResolvedValueOnce(empty)
    .mockResolvedValueOnce({...empty,home:{...empty.home,totalPoints:1,unspecifiedPoints:1}}).mockResolvedValue(empty);
  render(<MantineProvider theme={theme} env="test"><MatchScoreboard match={match} set={set} canManage onBusyChange={()=>{}}/></MantineProvider>);
  await screen.findByText('Vojvodina 0 : 0 Partizan'); await open();
  fireEvent.click(screen.getByRole('button',{name:'Poen za domaćina'}));
  await screen.findByText('1 poen');
  fireEvent.click(screen.getByRole('button',{name:'Poništi poslednji poen'}));
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi poništavanje'}));
  const table=await screen.findByRole('table',{name:'Pregled timova'});
  expect(cells(table,'Ukupno poena')).toEqual(['0','0']); expect(api.matchStatistics).toHaveBeenCalledTimes(3);
});
