import { useEffect, useState } from 'react';
import { apiClient, ApiClientError } from './shared/api';
import type { Health } from '../../CONTRACTS/types';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.health().then(setHealth).catch((reason: unknown) => {
      setError(reason instanceof ApiClientError ? reason.message : 'Backend is unavailable');
    });
  }, []);

  return (
    <main className="app-shell">
      <section className="app-panel" aria-labelledby="app-title">
        <p className="eyebrow">TTKMap</p>
        <h1 id="app-title">Карта пространства</h1>
        <p className="intro">Основа редактора и публичного просмотра готова для подключения модулей.</p>
        <p className={error ? 'status error' : 'status'}>{error ?? (health ? 'API подключён' : 'Проверяем API…')}</p>
        <nav className="route-links" aria-label="Режимы приложения">
          <a href="/edit">Редактор организатора</a>
          <a href="/m/demo">Публичная карта</a>
        </nav>
      </section>
    </main>
  );
}
