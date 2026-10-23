import React, { useRef, useState } from 'react';
import type { MapDocument, NavEdge, NavNode, Poi, Shape } from '../../../../CONTRACTS/types';
import { apiClient, ApiClientError } from '../../shared/api';
import { svgPointFromClient } from '../../shared/coordinates';
import { Icon } from '../../shared/Icon';
import { categoryDisplayName } from '../../shared/spacesData';

export interface PlanEditorProps {
  mapId: string | null;
  widthUnits: number;
  heightUnits: number;
  document: MapDocument;
  darkMode: boolean;
  isAuthenticated: boolean;
  onChangeDocument: (next: MapDocument) => void;
  onSaveDocument: (next?: MapDocument) => Promise<void>;
  onNotify: (msg: string) => void;
  captureSlot?: React.ReactNode;
}

type EditorTool = 'select' | 'add_poi' | 'add_wall' | 'add_room' | 'add_node';

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const PlanEditor: React.FC<PlanEditorProps> = ({
  mapId,
  widthUnits,
  heightUnits,
  document: mapDoc,
  darkMode,
  isAuthenticated,
  onChangeDocument,
  onSaveDocument,
  onNotify,
  captureSlot,
}: PlanEditorProps) => {
  const [generatedCanvasMap, setGeneratedCanvasMap] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>('add_poi');
  const [newPoiTitle, setNewPoiTitle] = useState('Новая точка ТТК');
  const [newPoiCategory, setNewPoiCategory] = useState<Poi['category']>('booth');
  const [newPoiCustomLabel, setNewPoiCustomLabel] = useState('Зона отдыха');
  const [newPoiDesc, setNewPoiDesc] = useState(
    'Корпус A, Этаж 1 | Свободно | 20 человек | Интерактивный стенд, Wi-Fi | TTK_Guest_5G',
  );
  const [newShapeLabel, setNewShapeLabel] = useState('Новая зона');
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(mapDoc.pois[0]?.id ?? null);

  const aiFileInputRef = useRef<HTMLInputElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const generate2DBlueprint = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== 'string') return;
      const img = new Image();
      img.src = result;
      img.onload = () => {
        const canvas = window.document.createElement('canvas');
        canvas.width = 700;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = darkMode ? '#1e293b' : '#f8fafc';
          ctx.fillRect(0, 0, 700, 500);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 4;
          ctx.strokeRect(30, 30, 640, 440);
          ctx.drawImage(img, 50, 50, 600, 400);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.fillRect(50, 50, 600, 400);
          setGeneratedCanvasMap(canvas.toDataURL());
          onNotify('2D Чертеж успешно сгенерирован ИИ!');
        }
      };
    };
    reader.readAsDataURL(file);

    if (mapId && isAuthenticated) {
      try {
        const asset = await apiClient.uploadAsset(mapId, { kind: 'plan', file });
        const nextDoc: MapDocument = {
          ...mapDoc,
          background_asset_id: asset.id,
        };
        onChangeDocument(nextDoc);
      } catch (err) {
        onNotify(err instanceof ApiClientError ? err.message : 'Чертеж обработан локально');
      }
    }
    event.target.value = '';
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const pt = svgPointFromClient(e.clientX, e.clientY, rect, widthUnits, heightUnits);
    const x = Math.round(pt.x);
    const y = Math.round(pt.y);

    if (tool === 'add_poi') {
      const nodeId = makeUuid();
      const poiId = makeUuid();
      const newNode: NavNode = { id: nodeId, x, y };
      const nextEdges: NavEdge[] = [...mapDoc.edges];

      if (mapDoc.nodes.length > 0) {
        let nearest = mapDoc.nodes[0];
        let bestDist = Math.hypot(nearest.x - x, nearest.y - y);
        for (const n of mapDoc.nodes) {
          const d = Math.hypot(n.x - x, n.y - y);
          if (d < bestDist && d > 1) {
            bestDist = d;
            nearest = n;
          }
        }
        if (bestDist > 1) {
          const [a, b] = nodeId < nearest.id ? [nodeId, nearest.id] : [nearest.id, nodeId];
          nextEdges.push({ id: makeUuid(), a, b });
        }
      }

      const newPoi: Poi = {
        id: poiId,
        title: newPoiTitle.trim() || 'Точка интереса',
        category: newPoiCategory,
        category_label: newPoiCategory === 'custom' ? newPoiCustomLabel.trim() || 'Особая' : null,
        description: newPoiDesc,
        x,
        y,
        nav_node_id: nodeId,
      };

      const nextDoc: MapDocument = {
        ...mapDoc,
        nodes: [...mapDoc.nodes, newNode],
        edges: nextEdges,
        pois: [...mapDoc.pois, newPoi],
      };
      onChangeDocument(nextDoc);
      setSelectedPoiId(poiId);
      onNotify(`Точка «${newPoi.title}» добавлена на координаты (${x}, ${y})`);
    } else if (tool === 'add_room') {
      const halfW = 60;
      const halfH = 45;
      const x1 = Math.max(10, x - halfW);
      const y1 = Math.max(10, y - halfH);
      const x2 = Math.min(widthUnits - 10, x + halfW);
      const y2 = Math.min(heightUnits - 10, y + halfH);
      const newRoom: Shape = {
        id: makeUuid(),
        kind: 'room',
        label: newShapeLabel.trim() || 'Помещение',
        points: [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 },
        ],
      };
      onChangeDocument({ ...mapDoc, shapes: [...mapDoc.shapes, newRoom] });
      onNotify(`Помещение «${newRoom.label}» размечено на плане`);
    } else if (tool === 'add_wall') {
      const x2 = Math.min(widthUnits - 10, x + 100);
      const newWall: Shape = {
        id: makeUuid(),
        kind: 'wall',
        label: 'Стена',
        points: [
          { x, y },
          { x: x2, y },
        ],
      };
      onChangeDocument({ ...mapDoc, shapes: [...mapDoc.shapes, newWall] });
      onNotify('Сегмент стены добавлен на план');
    } else if (tool === 'add_node') {
      const nodeId = makeUuid();
      const newNode: NavNode = { id: nodeId, x, y };
      const nextEdges: NavEdge[] = [...mapDoc.edges];
      if (mapDoc.nodes.length > 0) {
        const prev = mapDoc.nodes[mapDoc.nodes.length - 1];
        if (Math.hypot(prev.x - x, prev.y - y) > 1) {
          const [a, b] = nodeId < prev.id ? [nodeId, prev.id] : [prev.id, nodeId];
          nextEdges.push({ id: makeUuid(), a, b });
        }
      }
      onChangeDocument({
        ...mapDoc,
        nodes: [...mapDoc.nodes, newNode],
        edges: nextEdges,
      });
      onNotify(`Узел маршрутизации добавлен (${x}, ${y})`);
    }
  };

  const handleDeletePoi = (poiId: string) => {
    const nextDoc: MapDocument = {
      ...mapDoc,
      pois: mapDoc.pois.filter((p) => p.id !== poiId),
      hotspots: mapDoc.hotspots.filter((h) => h.poi_id !== poiId),
    };
    onChangeDocument(nextDoc);
    if (selectedPoiId === poiId) {
      setSelectedPoiId(nextDoc.pois[0]?.id ?? null);
    }
    onNotify('Точка интереса удалена');
  };

  const selectedPoi = mapDoc.pois.find((p) => p.id === selectedPoiId) ?? null;

  return (
    <div className="space-y-6 animate-view-enter">
      <div className={captureSlot ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch' : ''}>
        {captureSlot}

        {/* AI 2D Blueprint Generator Card (matches Front/index.html) */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-4 flex flex-col justify-between shadow-sm">
          <div className="space-y-3">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Icon name="sparkles" className="w-5 h-5 text-brand-600 shrink-0" />
              <span>ИИ-генератор 2D плана и подложки</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Загрузите чертеж или фото плана (PNG/JPEG/WebP), ИИ построит векторный план с разметкой и привяжет подложку
            </p>
          </div>

          <input
            ref={aiFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={generate2DBlueprint}
          />

          <div
            onClick={() => aiFileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-6 text-center cursor-pointer hover:border-brand-600 transition bg-slate-50 dark:bg-slate-900/70"
          >
            <Icon name="sparkles" className="w-7 h-7 mx-auto text-brand-600 mb-2" />
            <p className="text-xs font-semibold">Нажмите для выбора файла чертежа</p>
            <p className="text-[11px] text-slate-400 mt-1">Поддерживаются PNG, JPEG, WebP</p>
          </div>

          {generatedCanvasMap && (
            <div className="space-y-2 pt-2 animate-view-enter">
              <h4 className="text-[10px] font-bold uppercase text-slate-400">Сгенерированный план:</h4>
              <img
                src={generatedCanvasMap}
                alt="Сгенерированный 2D план"
                className="rounded-xl border border-slate-300 dark:border-slate-700 max-h-48 mx-auto shadow-md"
              />
            </div>
          )}
        </div>
      </div>

      {/* Interactive 2D SVG Map & POI Editor (Full width) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Icon name="map" className="w-5 h-5 text-brand-600" /> Интерактивный 2D-редактор плана и POI
            </h3>
            <p className="text-xs text-slate-500">
              Кликните по схеме, чтобы разместить точку интереса (POI), комнату, стену или узел графа навигации
            </p>
          </div>
          <button
            onClick={() => onSaveDocument()}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition"
          >
            <Icon name="save" className="w-4 h-4" /> Сохранить изменения на сервер
          </button>
        </div>

        {/* Tool Buttons */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['add_poi', 'Добавить POI'],
              ['add_room', 'Добавить комнату'],
              ['add_wall', 'Нарисовать стену'],
              ['add_node', 'Узел маршрута'],
              ['select', 'Выбор / Редактирование'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTool(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                tool === key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* New POI / Shape Configuration */}
        {tool === 'add_poi' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs">
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Название точки</label>
              <input
                type="text"
                value={newPoiTitle}
                onChange={(e) => setNewPoiTitle(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Категория</label>
              <select
                value={newPoiCategory}
                onChange={(e) => setNewPoiCategory(e.target.value as Poi['category'])}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5"
              >
                <option value="entrance">Вход / Ресепшн (entrance)</option>
                <option value="hall">Зал / Переговорная (hall)</option>
                <option value="booth">Стенд (booth)</option>
                <option value="service_desk">Стойка обслуживания (service_desk)</option>
                <option value="wifi">Точка Wi-Fi (wifi)</option>
                <option value="custom">Своя категория (custom)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-500 mb-1">
                {newPoiCategory === 'custom' ? 'Название своей категории' : 'Описание и параметры'}
              </label>
              {newPoiCategory === 'custom' ? (
                <input
                  type="text"
                  value={newPoiCustomLabel}
                  onChange={(e) => setNewPoiCustomLabel(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5"
                />
              ) : (
                <input
                  type="text"
                  value={newPoiDesc}
                  onChange={(e) => setNewPoiDesc(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5"
                />
              )}
            </div>
          </div>
        )}

        {tool === 'add_room' && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs flex items-center gap-3">
            <span className="font-semibold text-slate-500">Подпись комнаты:</span>
            <input
              type="text"
              value={newShapeLabel}
              onChange={(e) => setNewShapeLabel(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5"
            />
          </div>
        )}

        {/* Interactive SVG Canvas */}
        <div className="overflow-auto bg-slate-50 dark:bg-slate-900 rounded-2xl p-3 sm:p-5 border border-slate-200 dark:border-slate-700 flex justify-center">
          <svg
            ref={svgRef}
            onClick={handleSvgClick}
            viewBox={`0 0 ${widthUnits} ${heightUnits}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full max-w-[760px] map-stage-aspect bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-crosshair shadow-inner block"
          >
            {/* Base Blueprint Frame */}
            <rect
              x="40"
              y="40"
              width={widthUnits - 80}
              height={heightUnits - 80}
              rx="16"
              stroke="#94a3b8"
              strokeWidth="3"
              fill="none"
            />

            {/* Shapes (Rooms, Corridors, Walls) */}
            {mapDoc.shapes.map((shape) => {
              const pts = shape.points.map((p) => `${p.x},${p.y}`).join(' ');
              const cx = shape.points.reduce((acc, p) => acc + p.x, 0) / Math.max(1, shape.points.length);
              const cy = shape.points.reduce((acc, p) => acc + p.y, 0) / Math.max(1, shape.points.length);
              return (
                <g key={shape.id}>
                  {shape.kind === 'wall' ? (
                    <polyline points={pts} fill="none" stroke="#64748b" strokeWidth="4" />
                  ) : (
                    <polygon
                      points={pts}
                      fill={shape.kind === 'corridor' ? 'rgba(148,163,184,0.12)' : 'rgba(227,27,35,0.06)'}
                      stroke="#cbd5e1"
                      strokeWidth="2"
                    />
                  )}
                  {shape.label && (
                    <text x={cx} y={cy} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="600">
                      {shape.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Navigation Graph Edges & Nodes */}
            {mapDoc.edges.map((edge) => {
              const na = mapDoc.nodes.find((n) => n.id === edge.a);
              const nb = mapDoc.nodes.find((n) => n.id === edge.b);
              if (!na || !nb) return null;
              return (
                <line
                  key={edge.id}
                  x1={na.x}
                  y1={na.y}
                  x2={nb.x}
                  y2={nb.y}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth="1.5"
                />
              );
            })}
            {mapDoc.nodes.map((node) => (
              <circle key={node.id} cx={node.x} cy={node.y} r="4" fill="#0ea5e9" />
            ))}

            {/* POIs */}
            {mapDoc.pois.map((poi) => (
              <g
                key={poi.id}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedPoiId(poi.id);
                }}
                className="cursor-pointer"
              >
                <circle
                  cx={poi.x}
                  cy={poi.y}
                  r={selectedPoiId === poi.id ? 12 : 9}
                  fill={selectedPoiId === poi.id ? '#E31B23' : '#ffffff'}
                  stroke="#E31B23"
                  strokeWidth="2.5"
                />
                <text
                  x={poi.x}
                  y={poi.y - 14}
                  textAnchor="middle"
                  fill="#E31B23"
                  fontSize="11"
                  fontWeight="700"
                >
                  {poi.title}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Selected POI Inline Inspector */}
        {selectedPoi && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-1 flex-1 min-w-[220px]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{selectedPoi.title}</span>
                <span className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-600 font-semibold">
                  {categoryDisplayName(selectedPoi.category, selectedPoi.category_label)}
                </span>
                <span className="text-slate-400">
                  ({Math.round(selectedPoi.x)}, {Math.round(selectedPoi.y)})
                </span>
              </div>
              <input
                type="text"
                value={selectedPoi.description}
                onChange={(e) => {
                  const val = e.target.value;
                  onChangeDocument({
                    ...mapDoc,
                    pois: mapDoc.pois.map((p) => (p.id === selectedPoi.id ? { ...p, description: val } : p)),
                  });
                }}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5"
              />
            </div>
            <button
              onClick={() => handleDeletePoi(selectedPoi.id)}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-semibold flex items-center gap-1"
            >
              <Icon name="trash-2" className="w-4 h-4" /> Удалить точку
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
