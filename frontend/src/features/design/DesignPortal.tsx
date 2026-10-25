import { useEffect, useState } from 'react';
import type { Session } from '../../../../CONTRACTS/types';
import DesignApp from '../../design/App';
import type { UserProfile } from '../../design/types';
import { ApiClientError, apiClient } from '../../shared/api';
import { navigate } from '../../shared/router';

type PortalState = 'loading' | 'ready' | 'error';

function profileFromSession(session: Session, roleOverride?: string): UserProfile {
  const [name] = session.user.email.split('@');
  const storedRole = typeof window !== 'undefined' ? localStorage.getItem('ttk_account_role') : null;
  const effectiveRole = roleOverride || storedRole || 'user';
  return {
    name: name || session.user.email,
    email: session.user.email,
    role: effectiveRole === 'organizer' || effectiveRole === 'Организатор' ? 'Организатор' : 'Пользователь',
  };
}

export function DesignPortal() {
  const [state, setState] = useState<PortalState>('loading');
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let disposed = false;
    void apiClient.session().then(
      (session) => {
        if (disposed) return;
        setUser(profileFromSession(session));
        setState('ready');
      },
      (error) => {
        if (disposed) return;
        if (error instanceof ApiClientError && error.status === 401) {
          setUser(null);
          setState('ready');
          return;
        }
        setState('error');
      },
    );
    return () => {
      disposed = true;
    };
  }, []);

  if (state === 'loading') {
    return <main className="auth-screen auth-screen--single"><p role="status">Подключаем карту пространств…</p></main>;
  }
  if (state === 'error') {
    return (
      <main className="auth-screen auth-screen--single">
        <section className="auth-form-wrap">
          <h1>Сервис временно недоступен</h1>
          <p role="alert">Не удалось проверить сессию. Проверьте соединение и повторите попытку.</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </section>
      </main>
    );
  }

  return (
    <DesignApp
      initialUser={user}
      onLogin={async (email, password, role = 'user') => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('ttk_account_role', role);
        }
        const session = await apiClient.login({ email, password });
        const profile = profileFromSession(session, role);
        setUser(profile);
        return profile;
      }}
      onRegister={async (email, password, role = 'user') => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('ttk_account_role', role);
        }
        const session = await apiClient.register({ email, password });
        const profile = profileFromSession(session, role);
        setUser(profile);
        return profile;
      }}
      onLogout={async () => {
        await apiClient.logout();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ttk_account_role');
        }
        setUser(null);
      }}
      onOrganizer={() => {
        const storedRole = typeof window !== 'undefined' ? localStorage.getItem('ttk_account_role') : null;
        if (storedRole === 'user') {
          return;
        }
        navigate('/organize');
      }}
      onOpenPublicMap={(slug) => navigate(`/m/${encodeURIComponent(slug)}`)}
    />
  );
}
