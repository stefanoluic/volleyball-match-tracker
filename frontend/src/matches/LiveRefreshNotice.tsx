import { Alert, Text } from '@mantine/core';
import type { LiveRefreshState } from './useLiveRefresh';

export function LiveRefreshNotice({ state, label }: { state: LiveRefreshState; label: string }) {
  return <Alert color={state.error ? 'yellow' : 'blue'} role="status" aria-label={'Praćenje uživo · ' + label}>
    {state.status === 'stopped' ? 'Automatsko osvežavanje je zaustavljeno. Upotrebite dugme za ručno osvežavanje da ponovo proverite pristup.'
      : state.status === 'paused' ? 'Automatsko osvežavanje je pauzirano dok je tab skriven ili nema mrežne veze.'
      : state.status === 'retrying' ? 'Podaci mogu biti zastareli. Ponovna provera za ' + state.retryDelay / 1000 + ' s.'
      : 'Automatska provera promena na svake 3 sekunde.'}
    {state.error && <Text size="sm" mt={4}>{state.error} Prikaz nije potvrđen kao najnoviji.</Text>}
    {state.lastUpdated !== null && <Text size="xs" mt={4}>Poslednja uspešna automatska provera: {new Date(state.lastUpdated).toLocaleTimeString('sr-Latn-RS')}</Text>}
  </Alert>;
}
