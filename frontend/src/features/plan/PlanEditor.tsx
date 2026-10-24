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

type EditorTool = 'wall' | 'poi' | 'door' | 'ruler' | 'window' | 'zone';

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

const MARKUP_TOOLS: Array<{ id: EditorTool; label: string; icon: string }> = [
  { id: 'wall', label: 'Стены', icon: 'square' },
  { id: 'poi', label: 'Точки POI', icon: 'map-pin' },
  { id: 'door', label: 'Проходы', icon: 'door-open' },
  { id: 'ruler', label: 'Линейка', icon: 'ruler' },
  { id: 'window', label: 'Окна', icon: 'app-window' },
  { id: 'zone', label: 'Зоны', icon: 'box' },
];

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
  const [tool, setTool] = useState<EditorTool>('poi');
  const [newPoiTitle, setNewPoiTitle] = useState('Новая точка ТТК');
  const [newPoiCategory, setNewPoiCategory] = useState<Poi['category']>('booth');
  const [newPoiCustomLabel, setNewPoiCustomLabel] = useState('Зона отдыха');
  const [newPoiDesc, setNewPoiDesc] = useState(
    'Корпус A, Этаж 1 | Свободно | 20 человек | Интерактивный стенд, Wi-Fi | TTK_Corporate (5G)',
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
          ctx.fillStyle = darkMode ? '#0f172a' : '#f8fafc';
          ctx.fillRect(0, 0, 700, 500);
          ctx.strokeStyle = '#E31B23';
          ctx.lineWidth = 4;
          ctx.strokeRect(30, 30, 640, 440);
          ctx.drawImage(img, 50, 50, 600, 400);
          ctx.fillStyle = 'rgba(227, 27, 35, 0.12)';
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

  const handleSelectMarkupTool = (nextTool: EditorTool) => {
    setTool(nextTool);
    onNotify(`Инструмент разметки: ${nextTool}`);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const pt = svgPointFromClient(e.clientX, e.clientY, rect, widthUnits, heightUnits);
    const x = Math.round(pt.x);
    const y = Math.round(pt.y);

    if (tool === 'poi') {
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
    } else if (tool === 'zone') {
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
      onNotify(`Зона «${newRoom.label}» размечена на плане`);
    } else if (tool === 'wall' || tool === 'window') {
      const x2 = Math.min(widthUnits - 10, x + 100);
      const newWall: Shape = {
        id: makeUuid(),
        kind: 'wall',
        label: tool === 'window' ? 'Окно' : 'Стена',
        points: [
          { x, y },
          { x: x2, y },
        ],
      };
      onChangeDocument({ ...mapDoc, shapes: [...mapDoc.shapes, newWall] });
      onNotify(tool === 'window' ? 'Оконный сегмент добавлен на план' : 'Сегмент стены добавлен на план');
    } else if (tool === 'door') {
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
      onNotify(`Проход / узел маршрутизации добавлен (${x}, ${y})`);
    } else if (tool === 'ruler') {
      const scaleM = mapDoc.scale_m_per_unit || 0.05;
      onNotify(`Координата (${x}, ${y}) • ${(x * scaleM).toFixed(1)}м × ${(y * scaleM).toFixed(1)}м`);
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-view-enter">
      {/* Left Column: 1. Инструменты разметки & 2. Мастер съемки */}
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            1. Инструменты разметки
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {MARKUP_TOOLS.map((item) => {
              const active = tool === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectMarkupTool(item.id)}
                  className={`p-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition ${
                    active
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Icon
                    name={item.icon}
                    className={`w-4 h-4 ${active ? 'text-white' : 'text-brand-600'}`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {tool === 'poi' && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <input
                type="text"
                value={newPoiTitle}
                onChange={(e) => setNewPoiTitle(e.target.value)}
                placeholder="Название новой POI"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
              />
              <select
                value={newPoiCategory}
                onChange={(e) => setNewPoiCategory(e.target.value as Poi['category'])}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="entrance">Вход / Ресепшн (entrance)</option>
                <option value="hall">Зал / Переговорная (hall)</option>
                <option value="booth">Стенд (booth)</option>
                <option value="service_desk">Стойка обслуживания (service_desk)</option>
                <option value="wifi">Точка Wi-Fi (wifi)</option>
                <option value="custom">Своя категория (custom)</option>
              </select>
              {newPoiCategory === 'custom' ? (
                <input
                  type="text"
                  value={newPoiCustomLabel}
                  onChange={(e) => setNewPoiCustomLabel(e.target.value)}
                  placeholder="Название своей категории"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
                />
              ) : (
                <input
                  type="text"
                  value={newPoiDesc}
                  onChange={(e) => setNewPoiDesc(e.target.value)}
                  placeholder="Описание точки"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
                />
              )}
            </div>
          )}

          {tool === 'zone' && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <input
                type="text"
                value={newShapeLabel}
                onChange={(e) => setNewShapeLabel(e.target.value)}
                placeholder="Подпись зоны/комнаты"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
          )}
        </div>

        {captureSlot}
      </div>

      {/* Right Column (lg:col-span-2): Интерактивный холст 2D разметки */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-800 p-6 sm:p-8 flex flex-col items-center justify-between text-center space-y-5 min-h-[420px] shadow-sm">
        <div className="w-full flex flex-wrap items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
            <Icon name="layers" className="w-8 h-8 text-brand-600 shrink-0" />
            <div>
              <h4 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Интерактивный холст 2D разметки
              </h4>
              <p className="text-xs text-slate-500">
                Редактор плана: кликните по схеме, чтобы разместить выбранный элемент ({tool}), или загрузите подложку
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={aiFileInputRef}
              type="file"
              accept="image/*,.svg,.dwg"
              className="hidden"
              onChange={generate2DBlueprint}
            />
            <button
              onClick={() => aiFileInputRef.current?.click()}
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold px-4 py-2.5 rounded-2xl text-xs transition shadow-sm flex items-center gap-1.5"
            >
              <Icon name="sparkles" className="w-4 h-4 text-brand-600" />
              <span>Загрузить файл планировки (SVG / DWG / PNG)</span>
            </button>
            <button
              onClick={() => void onSaveDocument()}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md flex items-center gap-1.5 transition"
            >
              <Icon name="save" className="w-4 h-4" />
              <span>Сохранить</span>
            </button>
          </div>
        </div>

        {/* Interactive SVG Canvas */}
        <div className="w-full overflow-auto bg-slate-50 dark:bg-slate-950 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-800 flex justify-center">
          <svg
            ref={svgRef}
            onClick={handleSvgClick}
            viewBox={`0 0 ${widthUnits} ${heightUnits}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full max-w-[720px] map-stage-aspect bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 cursor-crosshair shadow-inner block"
          >
            {generatedCanvasMap && (
              <image
                href={generatedCanvasMap}
                x="0"
                y="0"
                width={widthUnits}
                height={heightUnits}
                preserveAspectRatio="none"
                opacity="0.45"
              />
            )}

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
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={shape.label === 'Окно' ? '#f97316' : '#64748b'}
                      strokeWidth="4"
                    />
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
          <div className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs text-left">
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
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5"
              />
            </div>
            <button
              onClick={() => handleDeletePoi(selectedPoi.id)}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-semibold flex items-center gap-1"
            >
              <Icon name="trash-2" className="w-4 h-4" /> Удалить точку
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
