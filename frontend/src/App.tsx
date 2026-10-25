import { useEffect, useState, type ReactNode } from "react";
import { Router } from "./app/Router";
import { LoginPage } from "./features/organizer/LoginPage";
import { MapList } from "./features/organizer/MapList";
import { OrganizerWorkspace } from "./features/organizer/OrganizerWorkspace";
import { PublicSpacePage } from "./features/visitor/PublicSpacePage";
import { DesignPortal } from "./features/design/DesignPortal";
import { apiClient, ApiClientError } from "./shared/api";
import { confirmNavigation, navigate } from "./shared/router";
import { Icon } from "./shared/Icon";

function OrganizerSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try {
        localStorage.setItem("theme", "light");
      } catch {}
    }
  };
  useEffect(() => {
    let disposed = false;
    void apiClient
      .session()
      .then(() => {
        if (!disposed) {
          const role = typeof window !== "undefined" ? localStorage.getItem("ttk_account_role") : null;
          if (role === "user") {
            setError("У пользователя нет доступа к редактору. Редактирование планов и панорам доступно только организаторам.");
            setState("error");
            return;
          }
          setState("ready");
        }
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
  if (state === "error") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center mx-auto text-xl font-black">
            🔒
          </div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Доступ к редактору ограничен</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400" role="alert">
            {error}
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#E31B23] hover:bg-[#FF4900] text-white transition shadow-sm cursor-pointer"
            >
              Вернуться к пространствам
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await apiClient.logout();
                } catch {}
                if (typeof window !== "undefined") {
                  localStorage.removeItem("ttk_account_role");
                }
                navigate("/login", true);
              }}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            >
              Войти как организатор
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
        <header className="app-bar flex items-center justify-between">
          <a className="app-bar__brand flex items-center gap-2 group select-none" href="/organize" aria-label="TTKMap, мои карты">
          <img src="/ttk-logo.png" alt="ТТК" className="h-7 w-auto object-contain" />
          <span className="text-[10px] font-black tracking-widest text-[#E31B23] uppercase">MAP</span>
          <b className="border-l border-slate-200 dark:border-slate-800 pl-3 ml-1 text-xs font-bold text-slate-700 dark:text-slate-300">
            Мои карты
          </b>
        </a>
          <div className="app-bar__actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="w-9 h-9 rounded-xl text-base bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center justify-center leading-none"
            title={darkMode ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
            aria-label="Переключить тему"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button
            type="button"
            className="app-bar__back px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            onClick={() => {
              if (!confirmNavigation()) return;
              navigate("/");
            }}
          >
            ← К пространствам
          </button>
          <button
            type="button"
            className="app-bar__logout px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            onClick={async () => {
              if (!confirmNavigation()) return;
              try {
                await apiClient.logout();
                navigate("/", true);
              } catch {
                setError("Не удалось выйти. Повторите попытку.");
              }
            }}
          >
            Выйти
          </button>
        </div>
        {error && <span role="alert">{error}</span>}
      </header>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

export function App() {
  // /edit is the historical alias for the organizer map list; keep one component, not two copies.
  const MapListView = () => (
    <OrganizerSession>
      <MapList />
    </OrganizerSession>
  );
  return (
    <Router
      routes={[
        {
          pattern: "/",
          component: () => <DesignPortal />,
        },
        { pattern: "/login", component: () => <LoginPage /> },
        { pattern: "/edit", component: MapListView },
        { pattern: "/organize", component: MapListView },
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
