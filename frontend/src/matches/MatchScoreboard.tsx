import { Alert, Badge, Button, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconPlus, IconRefresh, IconArrowBackUp } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { Match, MatchPreparation, MatchSet } from '../api/client';
import { SetCourtView } from './SetCourtView';
import { SetSubstitutions } from './SetSubstitutions';
import { LiberoReplacements } from './LiberoReplacements';
import { PointDetailsForm } from './PointDetailsForm';
import { pointActionLabels, pointPlayerLabel } from './pointDetails';
import { MatchStatisticsPanel } from './MatchStatisticsPanel';
import { LiveRefreshNotice } from './LiveRefreshNotice';
import { useMatchScore } from './useMatchScore';

const time = (value: string) => new Intl.DateTimeFormat('sr-Latn-RS', {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(new Date(value));

export function MatchScoreboard({ match, set, canManage, onBusyChange, onSetFinished }: {
  match: Match; set: MatchSet; canManage: boolean; onBusyChange: (busy: boolean) => void;
  onSetFinished?: (result: MatchPreparation) => void;
}) {
  const { score, loading, loadError, writeError, busy, pending, confirming, setConfirming,
    confirmFinish, setConfirmFinish, liveEnabled, live, refresh, execute } = useMatchScore(match, set, canManage, onSetFinished);
  const [substitutionEditing, setSubstitutionEditing] = useState(false);
  const [liberoEditing, setLiberoEditing] = useState(false);
  const [pointEditing, setPointEditing] = useState(false);
  useEffect(() => { onBusyChange(busy || substitutionEditing || liberoEditing || pointEditing); }, [busy, substitutionEditing, liberoEditing, pointEditing, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const teamName = (teamId: string) => teamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
  const editable = canManage && !!score && (score.canRecord || score.canUndo || score.canFinish);
  const unavailable = busy || loading || !!loadError || !!writeError || !!pending || !!confirming || confirmFinish;
  const blocked = unavailable || substitutionEditing || liberoEditing || pointEditing;
  function add(teamId: string) {
    if (!score?.canRecord || !editable || blocked) return;
    void execute({ kind: 'add', requestId: crypto.randomUUID(), version: score.version, scoringTeamId: teamId });
  }

  return <Stack gap="lg" aria-busy={busy || loading}>
    <Paper component="section" withBorder p="lg" className="roster-team" aria-label={'Rezultat seta ' + set.number}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2} size="h3">Set {set.number}</Title>
          <Group gap="xs"><Badge color={score?.setStatus === 'FINISHED' ? 'gray' : 'teal'}>
            {(score?.setStatus ?? set.status) === 'LIVE' ? 'U toku' : 'Završen'}</Badge>
            <Button variant="light" size="xs" disabled={busy || loading || substitutionEditing || liberoEditing || pointEditing} onClick={refresh}
              leftSection={<IconRefresh size={15} />}>Osveži rezultat</Button></Group>
        </Group>
        {loading && !score ? <Skeleton height={55} role="status" aria-label="Učitavanje rezultata" />
          : score && <Text size="xl" fw={700} ta="center" aria-live="polite" aria-atomic="true">
            {match.homeTeam.name} {score.homeScore} : {score.awayScore} {match.awayTeam.name}
          </Text>}
        <Text size="sm">Prvi servis: {teamName(set.firstServingTeamId)}</Text>
        {liveEnabled && <LiveRefreshNotice state={live} label="rezultat seta" />}
        {loadError && <Alert color="red" role="alert">{loadError}</Alert>}
        {writeError && <Alert color="red" role="alert">{writeError}
          <Text size="sm" mt="xs">{pending
            ? 'Nije potvrđeno da li je server sačuvao unos. Ponovite isti zahtev ili osvežite rezultat pre novog unosa.'
            : 'Osvežite rezultat pre sledećeg unosa.'}</Text>
          {pending && <Button variant="light" color="red" size="xs" mt="sm" disabled={busy || loading}
            onClick={() => void execute(pending)}>Ponovi isti zahtev</Button>}
        </Alert>}
        {editable && <>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Button size="md" disabled={blocked || !score.canRecord} leftSection={<IconPlus size={18} />}
              onClick={() => add(match.homeTeam.id)}>Poen za domaćina</Button>
            <Button size="md" color="teal" disabled={blocked || !score.canRecord} leftSection={<IconPlus size={18} />}
              onClick={() => add(match.awayTeam.id)}>Poen za gosta</Button>
          </SimpleGrid>
          <Text size="xs" c="dimmed">Gornja dugmad dodaju poen bez podataka o akciji i igraču. Za statistiku koristite detaljan unos umesto brzog.</Text>
          <PointDetailsForm match={match} score={score} disabled={unavailable || substitutionEditing || liberoEditing}
            busy={busy} onCommand={(command) => void execute(command)} onEditingChange={setPointEditing} />
          <Group justify="flex-end"><Button variant="light" color="red" disabled={blocked || !score.canUndo}
            leftSection={<IconArrowBackUp size={17} />} onClick={() => setConfirming(score.lastActivePoint)}>
            Poništi poslednji poen
          </Button></Group>
          {confirming && <Alert color="yellow" role="alert" title="Poništavanje poena">
            Poništiti poslednji važeći poen za tim {teamName(confirming.scoringTeamId)}?
            Unos će ostati u istoriji kao poništen.
            <Group mt="sm">
              <Button variant="default" size="xs" disabled={busy} onClick={() => setConfirming(null)}>Odustani</Button>
              <Button color="red" size="xs" loading={busy} onClick={() => {
                if (!score) return;
                void execute({ kind: 'undo', requestId: crypto.randomUUID(), version: score.version, pointId: confirming.id });
              }}>Potvrdi poništavanje</Button>
            </Group>
          </Alert>}
        </>}
        {score?.canFinish && <Alert color="teal" role="status">
          Postignut je rezultat za kraj seta. Pobednik: {teamName(score.winnerTeamId!)}.
          {canManage && <Stack mt="sm" gap="sm">
            <Text size="sm">Pre potvrde možete poništiti pogrešan završni poen. Posle potvrde korekcije ovog seta nisu dozvoljene.</Text>
            {confirmFinish ? <Group>
              <Button variant="default" size="xs" disabled={busy} onClick={() => setConfirmFinish(false)}>Odustani od završavanja</Button>
              <Button color="teal" size="xs" loading={busy} onClick={() => {
                void execute({ kind: 'finish', requestId: crypto.randomUUID(), version: score.version });
              }}>Potvrdi kraj seta</Button>
            </Group> : <Button w="fit-content" color="teal" disabled={blocked} onClick={() => setConfirmFinish(true)}>Završi set</Button>}
          </Stack>}
        </Alert>}
        {score && !editable && <Text size="sm" c="dimmed">{canManage
          ? 'Unos nije dostupan jer utakmica ili set nisu u toku.' : 'Pristup za pregled. Aktivnu utakmicu pratite automatski; ručno osvežavanje je takođe dostupno.'}</Text>}
        <Text size="xs" c="dimmed">Servis i rotacija prate važeće poene; kraj seta potvrđuje statističar. Detalji opisuju samo završnu akciju, ne sve dodire lopte.</Text>
      </Stack>
    </Paper>
    {score && !loading && !loadError && !writeError && <SetCourtView match={match} score={score} />}
    {score && <LiberoReplacements match={match} score={score} canManage={canManage} disabled={unavailable || substitutionEditing || pointEditing}
      busy={busy} onCommand={(command) => void execute(command)} onEditingChange={setLiberoEditing} />}
    {score && <SetSubstitutions match={match} score={score} canManage={canManage} disabled={unavailable || liberoEditing || pointEditing}
      busy={busy} onCommand={(command) => void execute(command)} onEditingChange={setSubstitutionEditing} />}
    {score && <MatchStatisticsPanel match={match} automatic={!canManage} revision={score.setId + ':' + score.version + ':' + score.setStatus}
      disabled={busy || loading || !!loadError || !!writeError || !!pending || substitutionEditing || liberoEditing || pointEditing} />}
    <Paper component="section" aria-label="Poslednji poeni" withBorder p="lg" className="roster-team">
      <Stack gap="md">
        <Group justify="space-between"><Title order={2} size="h4">Poslednji poeni</Title>
          <Text size="xs" c="dimmed">Poslednjih 20 unosa · najnoviji prvi</Text></Group>
        {score?.points.length === 0 && <Text size="sm" c="dimmed">Još nema unetih poena.</Text>}
        {score?.points.map((point) => <div key={point.id} className="roster-player">
          <Group justify="space-between">
            <div><Text size="sm" fw={600}>#{point.sequenceNumber} · Poen za {teamName(point.scoringTeamId)}</Text>
              <Text size="sm">{pointActionLabels[point.actionType] ?? pointActionLabels.UNSPECIFIED}
                {point.participant && ' · ' + (point.actionType === 'OPPONENT_ERROR' ? 'Greška: ' : '') + pointPlayerLabel(point.participant)}</Text>
              <Text size="xs" c="dimmed">{time(point.createdAt)} · Rezultat posle unosa: {point.homeScoreAfter}:{point.awayScoreAfter}</Text></div>
            {point.cancelledAt && <Badge color="red" variant="light">Poništen</Badge>}
          </Group>
          {point.cancelledAt && <Text size="xs" c="dimmed" mt={5}>Poništen u {time(point.cancelledAt)} · ne ulazi u trenutni rezultat</Text>}
        </div>)}
      </Stack>
    </Paper>
  </Stack>;
}
