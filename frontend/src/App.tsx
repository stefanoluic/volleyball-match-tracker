import { useEffect, useState } from 'react';

type ConnectionState = 'checking' | 'ready' | 'unavailable';

export function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function checkConnection() {
      setConnection('checking');

      try {
        const response = await fetch('/api/system/health', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Health check returned ${response.status}`);
        }

        const result: unknown = await response.json();
        const isHealthy =
          typeof result === 'object' &&
          result !== null &&
          'status' in result &&
          result.status === 'UP';

        if (!controller.signal.aborted) {
          setConnection(isHealthy ? 'ready' : 'unavailable');
        }
      } catch {
        if (!controller.signal.aborted) {
          setConnection('unavailable');
        }
      }
    }

    void checkConnection();
    return () => controller.abort();
  }, [attempt]);

  return (
    <main className="setup-page">
      <p className="eyebrow">Volleyball Match Tracker</p>
      <h1>Projekat je postavljen.</h1>
      <p>Početna provera veze između React aplikacije, backenda i baze.</p>

      <section className="connection-card" aria-labelledby="connection-heading">
        <h2 id="connection-heading">Status povezivanja</h2>
        <p role="status" className={`connection-status ${connection}`}>
          {connection === 'checking' && 'Provera je u toku…'}
          {connection === 'ready' && 'React → Spring Boot → PostgreSQL: veza radi.'}
          {connection === 'unavailable' &&
            'Veza nije dostupna. Proveri da li su backend i baza pokrenuti.'}
        </p>
        <button
          type="button"
          disabled={connection === 'checking'}
          onClick={() => setAttempt((current) => current + 1)}
        >
          Proveri ponovo
        </button>
      </section>

      <p className="note">Ovo je tehnička početna stranica. Ekrani aplikacije slede.</p>
    </main>
  );
}
