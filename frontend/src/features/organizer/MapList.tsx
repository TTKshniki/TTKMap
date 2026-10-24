import { useEffect, useState } from "react";
import type { MapSummary } from "../../../../CONTRACTS/types";
import { apiClient } from "../../shared/api";
import { navigate } from "../../shared/router";
import { Icon } from "../../shared/Icon";

export function MapList() {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [title, setTitle] = useState("");
  const [width, setWidth] = useState(700);
  const [height, setHeight] = useState(500);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    void apiClient
      .listMaps()
      .then((items) => {
        if (!disposed) setMaps(items);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <main className="workspace workspace-dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ОРГАНИЗАТОРСКИЙ КАБИНЕТ</p>
          <h1>Мои карты</h1>
          <p>Управляйте пространствами и публикуйте готовые карты.</p>
        </div>
        <span className="heading-mark" aria-hidden="true">TTK</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form
        className="toolbar map-create-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const result = await apiClient.createMap({
              title,
              description: "",
              width_units: width,
              height_units: height,
              scale_m_per_unit: null,
              max_walk_gap_units: 500,
            });
            navigate(`/organize/${result.map.snapshot.id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Ошибка создания");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Название карты
          <input
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Ширина
          <input
            type="number"
            min={1}
            max={100000}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label>
          Высота
          <input
            type="number"
            min={1}
            max={100000}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </label>
        <button className="button button-primary" disabled={busy}>{busy ? "Создаём…" : "Создать карту"}</button>
      </form>
      <div className="section-heading"><h2>Пространства</h2><span>{maps.length} карт</span></div>
      <ul className="map-list map-list--designed">
        {maps.map((map) => (
          <li key={map.id}>
            <div className="map-row-main">
              <span className="map-row-symbol"><Icon name="map" className="map-row-icon" /></span>
              <div>
                <a href={`/organize/${map.id}`}>{map.title}</a>
                <small>Обновлена {new Date(map.updated_at).toLocaleDateString("ru-RU")}</small>
              </div>
            </div>
            <div className="map-row-meta">
              <span className={`status-tag ${map.is_published ? "status-tag--published" : ""}`}>
                {map.is_published ? "Опубликована" : "Черновик"}
              </span>
              <span className="map-revision">v{map.revision}</span>
              <a className="map-open-link" href={`/organize/${map.id}`} aria-label={`Открыть карту ${map.title}`}>
                Открыть <span aria-hidden="true">↗</span>
              </a>
            </div>
          </li>
        ))}
      </ul>
      {!maps.length && (
        <div className="empty-state">
          <span className="empty-state-mark">01</span>
          <h3>Пока нет карт</h3>
          <p>Создайте пространство, чтобы начать разметку плана и настройку маршрутов.</p>
        </div>
      )}
    </main>
  );
}
