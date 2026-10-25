import { useEffect, useRef, useState } from "react";
import type {
  AssetRef,
  Hotspot,
  MapDocument,
  Panorama,
} from "../../../../CONTRACTS/types";
import { PlanEditor } from "../plan";
import { CaptureGuide } from "../capture";
import { PanoramaViewer } from "../panorama";
import { useWorkspace } from "./useWorkspace";
import { iframeCode } from "./share";
import { Icon } from "../../shared/Icon";
import { buildVisitorModel } from "../visitor/model";
import { IsometricViewer } from "../model3d/IsometricViewer";

export function OrganizerWorkspace({ mapId }: { mapId: string }) {
  const ws = useWorkspace(mapId);
  const latest = useRef(ws.draft);
  latest.current = ws.draft;
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [panoramaId, setPanoramaId] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  if (!ws.map || !ws.draft)
    return (
      <main className="workspace">
        <p role={ws.error ? "alert" : "status"}>
          {ws.error || "Загружаем карту…"}
        </p>
        <button onClick={() => void ws.reload()}>Повторить загрузку</button>
      </main>
    );
  const doc = ws.draft,
    map = ws.map.snapshot;
  const preview = buildVisitorModel({ ...map, document: doc, assets: ws.assets });
  const selectedPano =
    doc.panoramas.find((p) => p.id === panoramaId) ?? doc.panoramas[0] ?? null;
  const edit = (update: (current: MapDocument) => MapDocument) => {
    if (latest.current) ws.change(update(latest.current));
  };
  const readyPanorama = (
    asset: AssetRef,
    title: string,
    x: number,
    y: number,
  ) => {
    ws.addAsset(asset);
    edit((current) => {
      if (current.panoramas.some((p) => p.asset_id === asset.id))
        return current;
      const node = [...current.nodes]
        .filter((n) => !current.panoramas.some((p) => p.nav_node_id === n.id))
        .sort(
          (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
        )[0];
      const panorama: Panorama = {
        id: crypto.randomUUID(),
        asset_id: asset.id,
        title,
        x,
        y,
        nav_node_id: node?.id ?? null,
        heading_offset_deg: 0,
      };
      setPanoramaId(panorama.id);
      return { ...current, panoramas: [...current.panoramas, panorama] };
    });
  };
  return (
    <main className="workspace">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mb-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#E31B23]">
              Настройки пространства
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
              {doc.title || "Без названия"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span
              role="status"
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                ws.dirty
                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60"
              }`}
            >
              {ws.dirty
                ? "Есть несохранённые изменения"
                : `Сохранено · v${map.revision}`}
            </span>
            <button
              className="btn-ttk bg-[#E31B23] hover:bg-[#FF4900] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition"
              disabled={ws.saving || ws.conflict}
              onClick={() => void ws.save()}
            >
              {ws.saving ? "Сохранение…" : "Сохранить карту"}
            </button>
            <button
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition"
              disabled={ws.saving || ws.conflict}
              onClick={() => void ws.save(!map.document.is_published)}
            >
              {map.document.is_published ? "Снять с публикации" : "Опубликовать"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Название карты
            <input
              maxLength={160}
              value={doc.title}
              onChange={(e) => ws.change({ ...doc, title: e.target.value })}
              className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
            />
          </label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Описание карты
            <input
              maxLength={4000}
              value={doc.description}
              onChange={(e) => ws.change({ ...doc, description: e.target.value })}
              className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
            />
          </label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Метров на единицу (масштаб поля)
            <input
              type="number"
              min={0.0001}
              max={1000}
              step="any"
              value={doc.scale_m_per_unit ?? ""}
              onChange={(e) => {
                const val = e.target.value === "" ? null : Number(e.target.value);
                ws.change({
                  ...doc,
                  scale_m_per_unit: val && val > 0 ? val : null,
                });
              }}
              placeholder="1 (например 0.1)"
              className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
            />
            <span className="text-[11px] text-orange-600 dark:text-orange-400 font-semibold block mt-1">
              Размер поля: {Math.round(map.width_units * (doc.scale_m_per_unit || 1))}м × {Math.round(map.height_units * (doc.scale_m_per_unit || 1))}м
            </span>
          </label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Размер клетки поля (сетка)
            <input
              type="number"
              min={5}
              max={500}
              step="1"
              value={doc.max_walk_gap_units || 25}
              onChange={(e) => {
                const val = Number(e.target.value);
                ws.change({ ...doc, max_walk_gap_units: val > 0 ? val : 25 });
              }}
              className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
            />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block mt-1">
              Клетка: {doc.max_walk_gap_units || 25} ед. {doc.scale_m_per_unit ? `(${((doc.max_walk_gap_units || 25) * doc.scale_m_per_unit).toFixed(1)}м)` : ""}
            </span>
          </label>
        </div>
      </div>

      {ws.error && (
        <div className="p-4 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-600 dark:text-rose-400 font-bold" role="alert">
          {ws.error}
        </div>
      )}
      {ws.conflict && (
        <section role="alert" className="p-4 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-600 dark:text-rose-400 font-bold space-y-2">
          <p>
            Карта изменена в другой вкладке. Ваши правки сохранены в редакторе;
            автоматическая перезапись остановлена.
          </p>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold"
              onClick={() => {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(
                  new Blob([JSON.stringify(doc, null, 2)], {
                    type: "application/json",
                  }),
                );
                link.download = "local-draft.json";
                link.click();
                URL.revokeObjectURL(link.href);
              }}
            >
              Скачать локальные правки
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold"
              onClick={() => {
                if (
                  window.confirm("Заменить локальные правки версией с сервера?")
                )
                  void ws.reload();
              }}
            >
              Загрузить серверную версию
            </button>
          </div>
        </section>
      )}
      {notice && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-slate-900/90 dark:bg-slate-100/90 text-white dark:text-slate-900 text-xs font-bold shadow-2xl backdrop-blur-md transition-all duration-300 pointer-events-none"
        >
          {notice}
        </div>
      )}

      {/* Секция: Публичная ссылка и встраивание (сворачиваемая) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mb-6 transition-all">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShareOpen(!shareOpen)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShareOpen(!shareOpen);
            }
          }}
          className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left cursor-pointer select-none group"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#E31B23]">
              Публикация и интеграция
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
              Публичная ссылка и встраивание
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                map.document.is_published
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              {map.document.is_published ? "Опубликовано для гостей" : "Черновик (не опубликовано)"}
            </span>
            <div className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-transform duration-200 ${shareOpen ? "rotate-180" : ""}`}>
              <Icon name="chevron-down" className="w-4 h-4" />
            </div>
          </div>
        </div>

        {shareOpen && (
          <div className="pt-5 mt-5 border-t border-slate-100 dark:border-slate-800 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Колонка 1: Прямая ссылка */}
              <div className="space-y-3 flex flex-col justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Прямая ссылка для посетителей (QR-код и браузер)
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/m/${map.slug}`}
                    className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono select-all focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
                  />
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/m/${map.slug}`;
                      navigator.clipboard.writeText(url);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                      setNotice("Ссылка скопирована в буфер обмена!");
                    }}
                    className="btn-ttk bg-[#E31B23] hover:bg-[#FF4900] text-white px-4 py-2 rounded-xl font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Icon name={copiedLink ? "check" : "copy"} className="w-3.5 h-3.5" />
                    <span>{copiedLink ? "Скопировано!" : "Копировать ссылку"}</span>
                  </button>
                  <a
                    href={`/m/${map.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
                  >
                    <span>Открыть карту</span>
                    <Icon name="external-link" className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Колонка 2: Код встраивания (iframe) */}
              <div className="space-y-3 flex flex-col justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Код для встраивания на сайт (iframe)
                  <textarea
                    readOnly
                    rows={2}
                    value={iframeCode(window.location.origin, map.slug, doc.title)}
                    className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono select-all focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23] resize-none"
                  />
                </label>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const code = iframeCode(window.location.origin, map.slug, doc.title);
                      navigator.clipboard.writeText(code);
                      setCopiedIframe(true);
                      setTimeout(() => setCopiedIframe(false), 2000);
                      setNotice("Код iframe скопирован!");
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Icon name={copiedIframe ? "check" : "copy"} className="w-3.5 h-3.5" />
                    <span>{copiedIframe ? "Код скопирован!" : "Скопировать код iframe"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Подсказка если карта не опубликована */}
            {!map.document.is_published && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300 font-medium">
                <span>
                  Карта пока в режиме черновика. Чтобы посетители могли открыть её по ссылке или в виджете, нажмите кнопку «Опубликовать».
                </span>
                <button
                  type="button"
                  onClick={() => void ws.save(true)}
                  disabled={ws.saving || ws.conflict}
                  className="btn-ttk bg-[#E31B23] hover:bg-[#FF4900] text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-md transition shrink-0 cursor-pointer"
                >
                  Опубликовать сейчас
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      <PlanEditor
        key={mapId}
        mapId={mapId}
        widthUnits={map.width_units}
        heightUnits={map.height_units}
        document={doc}
        assets={ws.assets}
        isAuthenticated
        onChangeDocument={ws.change}
        onAsset={ws.addAsset}
        onNotify={setNotice}
        onSaveDocument={() => ws.save()}
        captureSlot={
          <CaptureGuide
            mapId={mapId}
            isAuthenticated
            onNotify={setNotice}
            onPanoramaAssetReady={readyPanorama}
            mapDocument={doc}
            widthUnits={map.width_units}
            heightUnits={map.height_units}
          />
        }
      />
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm mt-6 space-y-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#E31B23]">
            Предпросмотр
          </span>
          <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
            Изометрическая 3D-карта
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {ws.dirty
              ? "Показан текущий черновик. После сохранения загрузится модель, собранная сервером."
              : preview.scaleMPerUnit
                ? "Серверная GLB-модель построена по сохранённому плану."
                : "Локальный 3D-просмотр. Для серверной GLB-модели задайте масштаб карты."}
          </p>
        </div>
        <div className="h-[min(68vh,38rem)] min-h-[22rem] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <IsometricViewer
            modelUrl={ws.dirty || !preview.scaleMPerUnit ? null : `/api/v1/maps/${encodeURIComponent(mapId)}/model3d.glb`}
            widthUnits={preview.widthUnits}
            heightUnits={preview.heightUnits}
            scaleMPerUnit={preview.scaleMPerUnit}
            shapes={preview.shapes}
            pois={preview.pois}
            panoramas={preview.panoramas}
            onSelectPoi={() => {}}
            onOpenPanorama={(panorama) => {
              setPanoramaId(panorama.id);
              setViewerOpen(true);
            }}
          />
        </div>
      </section>
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mt-6 space-y-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#E31B23]">
            Интерактивный 360° Тур
          </span>
          <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
            Панорамы и хотспоты
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Положение, узел маршрута и направление редактируются в свойствах
            объекта на плане.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 max-w-lg">
          <label className="flex-1 text-xs font-bold text-slate-700 dark:text-slate-300">
            Панорама
            <select
              value={selectedPano?.id ?? ""}
              onChange={(e) => setPanoramaId(e.target.value)}
              className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
            >
              <option value="">Выберите панораму</option>
              {doc.panoramas.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!selectedPano}
            onClick={() => setViewerOpen(true)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 transition"
          >
            Редактировать хотспоты
          </button>
        </div>
      </section>
      <PanoramaViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title={selectedPano?.title ?? ""}
        imageUrl={
          selectedPano ? `/api/v1/media/${selectedPano.asset_id}/mobile` : ""
        }
        panorama={selectedPano}
        panoramas={doc.panoramas}
        hotspots={doc.hotspots}
        pois={doc.pois}
        assets={ws.assets}
        editable
        onSelectPanorama={setPanoramaId}
        onAddHotspot={(hotspot: Omit<Hotspot, "id">) =>
          edit((current) => ({
            ...current,
            hotspots: [
              ...current.hotspots.filter(
                (h) =>
                  !(
                    h.panorama_id === hotspot.panorama_id &&
                    h.kind === hotspot.kind &&
                    h.poi_id === hotspot.poi_id &&
                    h.target_panorama_id === hotspot.target_panorama_id
                  ),
              ),
              { ...hotspot, id: crypto.randomUUID() },
            ],
          }))
        }
        onDeleteHotspot={(id) =>
          edit((current) => ({
            ...current,
            hotspots: current.hotspots.filter((h) => h.id !== id),
          }))
        }
      />
    </main>
  );
}
