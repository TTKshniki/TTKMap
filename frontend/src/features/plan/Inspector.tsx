import { useState } from "react";
import type {
  MapDocument,
  Panorama,
  Poi,
  Shape,
} from "../../../../CONTRACTS/types";
import { removeSelection, type Selection } from "./model";
import { normalizeYaw } from "../../shared/coordinates";

export const categories: Record<Poi["category"], string> = {
  booth: "Стенд",
  hall: "Зал",
  entrance: "Вход",
  service_desk: "Стойка обслуживания",
  wifi: "Wi-Fi",
  custom: "Другое",
};

export function nodeLabel(doc: MapDocument, id: string) {
  const node = doc.nodes.find((n) => n.id === id);
  return (
    doc.pois.find((p) => p.nav_node_id === id)?.title ??
    (node ? `Узел (${Math.round(node.x)}, ${Math.round(node.y)})` : "Нет узла")
  );
}

export function Inspector({
  doc,
  selection,
  width,
  height,
  change,
}: {
  doc: MapDocument;
  selection: NonNullable<Selection>;
  width: number;
  height: number;
  change: (doc: MapDocument) => void;
}) {
  const [step, setStep] = useState(10);
  const entity = doc[selection.kind].find((item) => item.id === selection.id);
  if (!entity) return null;

  const minX = "points" in entity && entity.points.length > 0 ? Math.min(...entity.points.map((p) => p.x)) : 0;
  const maxX = "points" in entity && entity.points.length > 0 ? Math.max(...entity.points.map((p) => p.x)) : 0;
  const minY = "points" in entity && entity.points.length > 0 ? Math.min(...entity.points.map((p) => p.y)) : 0;
  const maxY = "points" in entity && entity.points.length > 0 ? Math.max(...entity.points.map((p) => p.y)) : 0;
  const currentW = Math.round(maxX - minX);
  const currentH = Math.round(maxY - minY);

  const resizeShape = (nextW: number, nextH: number) => {
    if (!("points" in entity)) return;
    const clampedW = Math.max(20, Math.min(width - minX, Math.round(nextW / 20) * 20));
    const clampedH = Math.max(20, Math.min(height - minY, Math.round(nextH / 20) * 20));
    patch({
      points: [
        { x: minX, y: minY },
        { x: minX + clampedW, y: minY },
        { x: minX + clampedW, y: minY + clampedH },
        { x: minX, y: minY + clampedH },
      ],
    });
  };

  const patch = (value: object) => {
    let nextDoc = {
      ...doc,
      [selection.kind]: doc[selection.kind].map((item) =>
        item.id === entity.id ? { ...item, ...value } : item,
      ),
    };
    if (
      selection.kind === "pois" &&
      "nav_node_id" in entity &&
      entity.nav_node_id
    ) {
      if ("x" in value || "y" in value) {
        nextDoc = {
          ...nextDoc,
          nodes: nextDoc.nodes.map((n) =>
            n.id === entity.nav_node_id
              ? {
                  ...n,
                  ...("x" in value ? { x: (value as { x: number }).x } : {}),
                  ...("y" in value ? { y: (value as { y: number }).y } : {}),
                }
              : n,
          ),
        };
      }
    }
    change(nextDoc);
  };

  const nudge = (dx: number, dy: number) => {
    if ("x" in entity && "y" in entity) {
      patch({
        x: Math.max(0, Math.min(width, Math.round(entity.x + dx))),
        y: Math.max(0, Math.min(height, Math.round(entity.y + dy))),
      });
    } else if ("points" in entity) {
      patch({
        points: entity.points.map((p) => ({
          x: Math.max(0, Math.min(width, Math.round(p.x + dx))),
          y: Math.max(0, Math.min(height, Math.round(p.y + dy))),
        })),
      });
    }
  };

  const centerEntity = () => {
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    if ("x" in entity && "y" in entity) {
      patch({ x: cx, y: cy });
    } else if ("points" in entity && entity.points.length > 0) {
      const avgX =
        entity.points.reduce((s, p) => s + p.x, 0) / entity.points.length;
      const avgY =
        entity.points.reduce((s, p) => s + p.y, 0) / entity.points.length;
      const dx = cx - avgX;
      const dy = cy - avgY;
      patch({
        points: entity.points.map((p) => ({
          x: Math.round(p.x + dx),
          y: Math.round(p.y + dy),
        })),
      });
    }
  };

  return (
    <section className="inspector bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
          Свойства объекта
        </h3>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          {selection.kind}
        </span>
      </div>

      {"title" in entity && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
          Название объекта
          <input
            maxLength={160}
            value={entity.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
          />
        </label>
      )}

      {"label" in entity && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
          Название фигуры
          <input
            maxLength={160}
            value={entity.label}
            onChange={(e) => patch({ label: e.target.value })}
            className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
          />
        </label>
      )}

      {"x" in entity && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(["x", "y"] as const).map((axis) => (
              <label
                key={axis}
                className="block text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Координата {axis.toUpperCase()}
                <input
                  type="number"
                  min={0}
                  max={axis === "x" ? width : height}
                  value={Math.round(entity[axis])}
                  onChange={(e) =>
                    patch({
                      [axis]: Math.max(
                        0,
                        Math.min(
                          axis === "x" ? width : height,
                          Number(e.target.value),
                        ),
                      ),
                    })
                  }
                  className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
                />
              </label>
            ))}
          </div>

          {/* D-Pad controls for precise positioning */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
              <span>Точное перемещение:</span>
              <div className="flex gap-1">
                {[1, 10, 50].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStep(s)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                      step === s
                        ? "bg-[#E31B23] text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    {s}px
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 pt-1">
              <button
                type="button"
                onClick={() => nudge(0, -step)}
                title={`Вверх на ${step}px`}
                className="w-10 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-black shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200"
              >
                ▲
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => nudge(-step, 0)}
                  title={`Влево на ${step}px`}
                  className="w-10 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-black shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={centerEntity}
                  title="Поместить в центр плана"
                  className="px-2.5 h-8 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-[11px] font-bold text-slate-800 dark:text-slate-200"
                >
                  В центр
                </button>
                <button
                  type="button"
                  onClick={() => nudge(step, 0)}
                  title={`Вправо на ${step}px`}
                  className="w-10 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-black shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  ▶
                </button>
              </div>
              <button
                type="button"
                onClick={() => nudge(0, step)}
                title={`Вниз на ${step}px`}
                className="w-10 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-black shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      )}

      {"category" in entity && (
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Категория
            <select
              value={entity.category}
              onChange={(e) =>
                patch({
                  category: e.target.value,
                  category_label: e.target.value === "custom" ? "Другое" : null,
                })
              }
              className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
            >
              {Object.entries(categories).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {entity.category === "custom" && (
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Своя категория
              <input
                maxLength={80}
                value={entity.category_label ?? ""}
                onChange={(e) => patch({ category_label: e.target.value })}
                className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
              />
            </label>
          )}
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Описание
            <textarea
              maxLength={4000}
              rows={3}
              value={entity.description}
              onChange={(e) => patch({ description: e.target.value })}
              className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
            />
          </label>

          {selection.kind === "pois" &&
            (entity.category === "entrance" ||
              entity.category_label === "Дверь" ||
              entity.title.includes("Дверь") ||
              entity.title.includes("Проход") ||
              (entity.description && entity.description.includes("->"))) && (
              <div className="p-3 bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-orange-700 dark:text-orange-400">
                  <span>Дверь / Проход:</span>
                  <span className="text-[10px] font-normal text-slate-500">
                    {entity.description?.match(/dir:(\d+)/)?.[1]
                      ? `Положение ${Number(entity.description.match(/dir:(\d+)/)?.[1]) + 1} из 4`
                      : "Положение 1 из 4"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const desc = entity.description || "";
                    const match = desc.match(/\[(\d+),(\d+)\s*->\s*(\d+),(\d+)(?:\s*\|\s*dir:(\d+))?\]/);
                    const currentDir = match && match[5] ? Number(match[5]) : 0;
                    const nextDir = (currentDir + 1) % 4;
                    let newDesc = desc;
                    if (match) {
                      const newTag = `[${match[1]},${match[2]} -> ${match[3]},${match[4]} | dir:${nextDir}]`;
                      newDesc = desc.replace(match[0], newTag);
                    } else {
                      newDesc = `${desc} [${Math.round(entity.x - 20)},${Math.round(entity.y)} -> ${Math.round(entity.x + 20)},${Math.round(entity.y)} | dir:${nextDir}]`.trim();
                    }
                    patch({ description: newDesc });
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#FF4900] hover:bg-[#e04000] text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <span className="text-sm">⇄</span>
                  <span>Сменить направление открывания</span>
                </button>
              </div>
            )}
        </div>
      )}

      {"nav_node_id" in entity && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
          Узел маршрута
          <select
            value={entity.nav_node_id ?? ""}
            onChange={(e) => patch({ nav_node_id: e.target.value || null })}
            className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
          >
            <option value="">Не привязан</option>
            {doc.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {nodeLabel(doc, node.id)}
              </option>
            ))}
          </select>
        </label>
      )}

      {"heading_offset_deg" in entity && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
          Направление панорамы, °
          <input
            type="number"
            min={-180}
            max={179.9}
            step={0.1}
            value={entity.heading_offset_deg}
            onChange={(e) =>
              patch({
                heading_offset_deg: normalizeYaw(Number(e.target.value)),
              })
            }
            className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
          />
        </label>
      )}

      {"points" in entity && (entity.kind === "room" || entity.kind === "corridor") && (
        <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Размеры (сетка 20 ед.):
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] font-bold text-slate-500">Ширина</span>
              <div className="flex items-center gap-1 mt-1">
                <button
                  type="button"
                  title="Уменьшить ширину на 20 ед."
                  onClick={() => resizeShape(currentW - 20, currentH)}
                  className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-bold flex items-center justify-center cursor-pointer text-slate-700 dark:text-slate-200"
                >
                  -
                </button>
                <span className="text-xs font-bold px-1 text-slate-800 dark:text-slate-100 min-w-12 text-center">
                  {currentW} ед.
                </span>
                <button
                  type="button"
                  title="Увеличить ширину на 20 ед."
                  onClick={() => resizeShape(currentW + 20, currentH)}
                  className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-bold flex items-center justify-center cursor-pointer text-slate-700 dark:text-slate-200"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500">Длина</span>
              <div className="flex items-center gap-1 mt-1">
                <button
                  type="button"
                  title="Уменьшить длину на 20 ед."
                  onClick={() => resizeShape(currentW, currentH - 20)}
                  className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-bold flex items-center justify-center cursor-pointer text-slate-700 dark:text-slate-200"
                >
                  -
                </button>
                <span className="text-xs font-bold px-1 text-slate-800 dark:text-slate-100 min-w-12 text-center">
                  {currentH} ед.
                </span>
                <button
                  type="button"
                  title="Увеличить длину на 20 ед."
                  onClick={() => resizeShape(currentW, currentH + 20)}
                  className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-bold flex items-center justify-center cursor-pointer text-slate-700 dark:text-slate-200"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {"points" in entity && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
            <span>Вершины фигуры ({entity.points.length}):</span>
            <button
              type="button"
              onClick={centerEntity}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200"
            >
              В центр
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {entity.points.map((point, index) => (
              <div
                key={index}
                className="grid grid-cols-2 gap-2 p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800"
              >
                {(["x", "y"] as const).map((axis) => (
                  <label
                    key={axis}
                    className="block text-[11px] font-bold text-slate-600 dark:text-slate-400"
                  >
                    В{index + 1} {axis.toUpperCase()}
                    <input
                      type="number"
                      min={0}
                      max={axis === "x" ? width : height}
                      value={Math.round(point[axis])}
                      onChange={(e) =>
                        patch({
                          points: entity.points.map((p, i) =>
                            i === index
                              ? { ...p, [axis]: Number(e.target.value) }
                              : p,
                          ),
                        })
                      }
                      className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {"a" in entity && (
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
          {nodeLabel(doc, entity.a)} → {nodeLabel(doc, entity.b)}
        </p>
      )}

      <button
        type="button"
        onClick={() => change(removeSelection(doc, selection))}
        className="w-full px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-xl transition flex items-center justify-center gap-1.5"
      >
        Удалить этот объект
      </button>
    </section>
  );
}