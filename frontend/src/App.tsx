import { useEffect, useState, type ReactNode } from "react";
import { Router } from "./app/Router";
import { LoginPage } from "./features/organizer/LoginPage";
import { MapList } from "./features/organizer/MapList";
import { OrganizerWorkspace } from "./features/organizer/OrganizerWorkspace";
import { PublicSpacePage } from "./features/visitor/PublicSpacePage";
import { apiClient, ApiClientError } from "./shared/api";
import { confirmNavigation, navigate } from "./shared/router";

function HomeRoute() {
  const [state, setState] = useState<"loading" | "anonymous" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    void apiClient.session().then(
      () => {
        if (!disposed) navigate("/organize", true);
      },
      (reason) => {
        if (disposed) return;
        if (reason instanceof ApiClientError && reason.status === 401) {
          setState("anonymous");
          return;
        }
        setError("Не удалось связаться с сервером. Проверьте соединение и повторите попытку.");
        setState("error");
      },
    );
    return () => {
      disposed = true;
    };
  }, []);
  if (state === "anonymous") return <LoginPage />;
  if (state === "error") {
    return (
      <main className="auth-screen auth-screen--single">
        <section className="auth-form-wrap">
          <a className="brand-lockup" href="/" aria-label="TTKMap">
            <span>TTK</span><small>MAP</small>
          </a>
          <h1>Сервис временно недоступен</h1>
          <p role="alert">{error}</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </section>
      </main>
    );
  }
  return <main className="auth-screen auth-screen--single"><p role="status">Подключаем кабинет…</p></main>;
}

function OrganizerSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    void apiClient
      .session()
      .then(() => {
        if (!disposed) setState("ready");
      })
      .catch((e) => {
        if (disposed) return;
        if (e instanceof ApiClientError && e.status === 401) navigate("/login");
        else {
          setError("Не удалось проверить сессию. Обновите страницу.");
          setState("error");
        }
      });
    return () => {
      disposed = true;
    };
  }, []);
  if (state === "loading") return <p role="status">Проверяем сессию…</p>;
  if (state === "error") return <p role="alert">{error}</p>;
  return (
    <>
      <header className="app-bar">
          <a className="app-brand" href="/organize" aria-label="TTKMap, мои карты">
            <span>TTK</span><small>MAP</small><b>Мои карты</b>
          </a>
          <button className="button button-quiet"
          onClick={async () => {
            if (!confirmNavigation()) return;
            try {
              await apiClient.logout();
              navigate("/login", true);
            } catch {
              setError("Не удалось выйти. Повторите попытку.");
            }
          }}
        >
          Выйти
        </button>
        {error && <span role="alert">{error}</span>}
      </header>
      {children}
    </>
  );
}

export function App() {
  return (
    <Router
      routes={[
        {
          pattern: "/",
          component: () => <HomeRoute />,
        },
        { pattern: "/login", component: () => <LoginPage /> },
        {
          pattern: "/edit",
          component: () => (
            <OrganizerSession>
              <MapList />
            </OrganizerSession>
          ),
        },
        {
          pattern: "/organize",
          component: () => (
            <OrganizerSession>
              <MapList />
            </OrganizerSession>
          ),
        },
        {
          pattern: "/organize/:mapId",
          component: (route) => (
            <OrganizerSession>
              <OrganizerWorkspace
                key={route.params.mapId}
                mapId={route.params.mapId}
              />
            </OrganizerSession>
          ),
        },
        {
          pattern: "/m/:slug",
          component: (route) => (
            <PublicSpacePage key={route.params.slug} slug={route.params.slug} />
          ),
        },
        {
          pattern: "/embed/:slug",
          component: (route) => (
            <PublicSpacePage
              key={route.params.slug}
              slug={route.params.slug}
              mode="embed"
            />
          ),
        },
      ]}
    />
  );
}
export default App;
