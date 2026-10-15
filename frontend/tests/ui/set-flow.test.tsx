import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPlayer, type MatchPreparation, type MatchSet, type SetScore, type Team } from '../../src/api/client';
import { MatchPreparationPage } from '../../src/matches/MatchPreparationPage';
import { theme } from '../../src/theme';
const home: Team = { id: 'home', name: 'Vojvodina', city: 'Novi Sad', createdAt: '2026-10-14T12:00:00Z' };
const away: Team = { ...home, id: 'away', name: 'Partizan' };
const match: Match = { id: 'match', homeTeam: home, awayTeam: away, status: 'LIVE',
  scheduledAt: home.createdAt, createdAt: home.createdAt };
function players(team: Team): MatchPlayer[] {
  return ['Marko','Nikola','Petar','Luka','Aleksa','Filip'].map((firstName,index) => ({
    id: team.id+'-entry-'+index, playerId: team.id+'-player-'+index, teamId: team.id,
    firstName,lastName:'Marković',jerseyNumber:index+1,position:'SETTER',isLibero:false,
  }));
}
const hp=players(home), ap=players(away);
function set(number: number, live = false): MatchSet {
  const homeWins = number%2===1;
  return { id:'set-'+number,number,status:live ? 'LIVE':'FINISHED',
    homeScore:live ? 0:homeWins ? number===5 ? 15:25:0,awayScore:live ? 0:homeWins ? 0:25,
    firstServingTeamId:homeWins ? home.id:away.id,startedAt:home.createdAt,
    homeLineup:hp.map((participant,index)=>({participant,rotationPosition:index+1})),
    awayLineup:ap.map((participant,index)=>({participant,rotationPosition:index+1})),
    scoreVersion:live ? 0:26,finishedAt:live ? null:home.createdAt,winnerTeamId:live ? null:homeWins ? home.id:away.id };
}
const first=set(1);
const between: MatchPreparation = { roster:{match,version:2,home:{team:home,selected:hp,available:[]},
  away:{team:away,selected:ap,available:[]}},firstSet:first,sets:[first],currentSet:null,nextSetNumber:2,homeSetsWon:1,awaySetsWon:0 };
const second=set(2,true);
const playingSecond: MatchPreparation={...between,sets:[first,second],currentSet:second,nextSetNumber:null};
function score(entry: MatchSet): SetScore {
  return {setId:entry.id,version:entry.scoreVersion,homeScore:entry.homeScore,awayScore:entry.awayScore,
    matchStatus:'LIVE',setStatus:entry.status,canRecord:entry.status==='LIVE',canUndo:false,canFinish:false,
    winnerTeamId:entry.winnerTeamId,lastActivePoint:null,points:[]};
}
beforeEach(()=>{
  vi.spyOn(api,'matchPreparation').mockResolvedValue(between);
  vi.spyOn(api,'setScore').mockImplementation(async (_match,id)=>score(id==='set-2' ? second:first));
  vi.spyOn(notifications,'show').mockReturnValue('notice');
});
afterEach(()=>vi.restoreAllMocks());
function renderPage(canManage=true) {
  const back=vi.fn();
  render(<MantineProvider theme={theme} env="test"><MatchPreparationPage matchId={match.id} canManage={canManage} onBack={back}/></MantineProvider>);
  return back;
}
async function prepareNext(number=2) {
  fireEvent.click(await screen.findByRole('button',{name:'Pripremi set '+number}));
  await screen.findByRole('form',{name:'Priprema seta '+number});
}
async function chooseSlot(team:Team,index:number) {
  fireEvent.click(screen.getByRole('combobox',{name:team.name+' · pozicija '+(index+1)}));
  fireEvent.click(await screen.findByRole('option',{name:'#'+(index+1)+' '+hp[index].firstName+' Marković · Tehničar'}));
}
async function fill() { for(const team of [home,away]) for(let i=0;i<6;i++) await chooseSlot(team,i); }
test('second set uses new sixes, fixed opposite serve and previous-set revision',async()=>{
  const start=vi.spyOn(api,'startNextSet').mockResolvedValue(playingSecond);
  renderPage(); await prepareNext();
  const serving=screen.getByRole('combobox',{name:/^Tim koji prvi servira/}) as HTMLInputElement;
  expect(serving.disabled).toBe(true); expect(serving.value).toBe(away.name);
  await fill(); fireEvent.click(screen.getByRole('button',{name:'Počni set 2'}));
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi početak seta'}));
  await waitFor(()=>expect(start).toHaveBeenCalledExactlyOnceWith(match.id,{
    rosterVersion:2,homeLineup:hp.map(p=>p.id),awayLineup:ap.map(p=>p.id),firstServingTeamId:away.id,
    number:2,previousSetId:first.id,previousSetVersion:26,
  }));
  await screen.findByText('Vojvodina 0 : 0 Partizan');
  expect((screen.getByRole('combobox',{name:'Set za pregled'}) as HTMLInputElement).value).toMatch(/Set 2/);
},20_000);
test('fifth set requires a fresh toss selection',async()=>{
  const prior=Array.from({length:4},(_,i)=>set(i+1));
  vi.mocked(api.matchPreparation).mockResolvedValue({...between,sets:prior,nextSetNumber:5,homeSetsWon:2,awaySetsWon:2});
  const fifth=set(5,true);
  vi.mocked(api.setScore).mockImplementation(async (_match,id)=>score(id===fifth.id ? fifth:first));
  const start=vi.spyOn(api,'startNextSet').mockResolvedValue({...between,sets:[...prior,fifth],currentSet:fifth,
    nextSetNumber:null,homeSetsWon:2,awaySetsWon:2});
  renderPage(); await prepareNext(5);
  const serving=screen.getByRole('combobox',{name:/^Tim koji prvi servira/}) as HTMLInputElement;
  expect(serving.disabled).toBe(false); expect(serving.value).toBe('');
  await fill(); fireEvent.click(screen.getByRole('button',{name:'Počni set 5'}));
  expect(screen.getByText('Izaberite tim koji prvi servira.')).toBeTruthy(); expect(start).not.toHaveBeenCalled();
  fireEvent.click(serving); fireEvent.click(await screen.findByRole('option',{name:home.name}));
  fireEvent.click(screen.getByRole('button',{name:'Počni set 5'}));
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi početak seta'}));
  await waitFor(()=>expect(start).toHaveBeenCalledWith(match.id,expect.objectContaining({number:5,firstServingTeamId:home.id,previousSetId:'set-4'})));
},20_000);
test('discarding partial next-set preparation returns to overview without a write',async()=>{
  const start=vi.spyOn(api,'startNextSet');
  renderPage(); await prepareNext(); await chooseSlot(home,0);
  fireEvent.click(screen.getByRole('button',{name:'Odustani od pripreme'}));
  expect(screen.getByText('Nesačuvane postave')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Odbaci izmene'}));
  await screen.findByRole('button',{name:'Pripremi set 2'}); expect(start).not.toHaveBeenCalled();
});
test('stale next-set start preserves entered sixes until explicit refresh',async()=>{
  vi.spyOn(api,'startNextSet').mockRejectedValue(new ApiError('Stanje setova je promenjeno.',409));
  renderPage(); await prepareNext(); await fill();
  fireEvent.click(screen.getByRole('button',{name:'Počni set 2'}));
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi početak seta'}));
  await screen.findByText('Stanje setova je promenjeno.');
  expect((screen.getByRole('combobox',{name:home.name+' · pozicija 1'}) as HTMLInputElement).value).toMatch(/Marko/);
  vi.mocked(api.matchPreparation).mockResolvedValue(playingSecond);
  fireEvent.click(screen.getByRole('button',{name:'Učitaj trenutno stanje'}));
  fireEvent.click(screen.getByRole('button',{name:'Odbaci izmene'}));
  await screen.findByText('Vojvodina 0 : 0 Partizan');
  expect(screen.queryByRole('form')).toBeNull();
},20_000);
test('coach sees waiting state without a start-next control',async()=>{
  renderPage(false);
  await screen.findByText('Čeka se da statističar pokrene set 2.');
  expect(screen.queryByRole('button',{name:'Pripremi set 2'})).toBeNull();
});
for(const canManage of [true,false]) {
  test('finished match stays read-only and exposes historical sets for '+canManage,async()=>{
    const all=Array.from({length:5},(_,i)=>set(i+1));
    vi.mocked(api.matchPreparation).mockResolvedValue({...between,roster:{...between.roster,match:{...match,status:'FINISHED'}},
      sets:all,nextSetNumber:null,homeSetsWon:3,awaySetsWon:2});
    vi.mocked(api.setScore).mockImplementation(async (_match,id)=>({...score(all.find(entry=>entry.id===id)!),
      matchStatus:'FINISHED',canRecord:false,canUndo:false,canFinish:false}));
    renderPage(canManage);
    await screen.findByText('Utakmica je završena. Pobednik: Vojvodina.');
    expect(screen.queryByRole('button',{name:/Pripremi set/})).toBeNull();
    expect(screen.queryByRole('button',{name:'Poen za domaćina'})).toBeNull();
    fireEvent.click(screen.getByRole('combobox',{name:'Set za pregled'}));
    fireEvent.click(await screen.findByRole('option',{name:'Set 2 · 0:25 · Završen'}));
    await screen.findByText('Vojvodina 0 : 25 Partizan');
  });
}
test('confirmed finish updates match summary and enables next preparation immediately',async()=>{
  const live={...first,status:'LIVE' as const,finishedAt:null,winnerTeamId:null,scoreVersion:25};
  vi.mocked(api.matchPreparation).mockResolvedValue({...between,firstSet:live,sets:[live],currentSet:live,nextSetNumber:null,
    homeSetsWon:0});
  vi.mocked(api.setScore).mockResolvedValueOnce({...score(live),canRecord:false,canFinish:true,winnerTeamId:home.id})
    .mockResolvedValue(score(first));
  const finish=vi.spyOn(api,'finishSet').mockResolvedValue(between);
  renderPage(); fireEvent.click(await screen.findByRole('button',{name:'Završi set'}));
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi kraj seta'}));
  await screen.findByRole('button',{name:'Pripremi set 2'});
  expect(screen.getByText('Vojvodina 1 : 0 Partizan · setovi')).toBeTruthy();
  expect(finish).toHaveBeenCalledWith(match.id,first.id,{version:25,requestId:expect.any(String)});
});
