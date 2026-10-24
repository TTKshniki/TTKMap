import { useState } from "react";
import { apiClient } from "../../shared/api";
import { navigate } from "../../shared/router";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="auth-screen">
      <section className="auth-brand-panel">
        <a className="brand-lockup brand-lockup--light" href="/" aria-label="TTKMap">
          <span>TTK</span><small>MAP</small>
        </a>
        <div className="auth-brand-copy">
          <p className="eyebrow">ПЛАТФОРМА КАРТ ПРОСТРАНСТВ</p>
          <h1>Навигация начинается с точного плана.</h1>
          <p>Создавайте интерактивные карты, размещайте панорамы и делитесь маршрутами с посетителями.</p>
        </div>
        <div className="auth-brand-footer"><span>TTKMap</span><span>Организаторский кабинет</span></div>
      </section>
      <section className="auth-form-wrap">
        <form
        className="auth-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            await apiClient.login({ email, password });
            navigate("/organize");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось войти");
          } finally {
            setBusy(false);
          }
        }}
        >
          <p className="eyebrow">ДОСТУП К ПРОСТРАНСТВАМ</p>
          <h2>Вход в кабинет</h2>
          <p className="auth-intro">Войдите, чтобы управлять картами и маршрутами.</p>
          <label>
            Электронная почта
            <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={busy}>{busy ? "Вход…" : "Войти"}</button>
          <p className="auth-help">Учётную запись выдаёт администратор площадки.</p>
        </form>
      </section>
    </main>
  );
}
