import React, { useState } from 'react';
import type { AssetRef, Hotspot, Panorama, Poi } from '../../../../CONTRACTS/types';
import { normalizeYaw } from '../../shared/coordinates';
import { Icon } from '../../shared/Icon';
import type { RichPoiItem } from '../../shared/spacesData';

export interface PanoramaViewerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  imageUrl: string;
  panorama?: Panorama | null;
  panoramas?: Panorama[];
  hotspots?: Hotspot[];
  pois?: Poi[];
  richPois?: RichPoiItem[];
  assets?: AssetRef[];
  onSelectPanorama?: (panoramaId: string) => void;
  onSelectPoi?: (poiId: string) => void;
  editable?: boolean;
  onAddHotspot?: (hotspot: Omit<Hotspot, 'id'>) => void;
  onDeleteHotspot?: (hotspotId: string) => void;
  initialYawDeg?: number;
}

export const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  isOpen,
  onClose,
  title,
  imageUrl,
  panorama = null,
  panoramas = [],
  hotspots = [],
  pois = [],
  richPois = [],
  onSelectPanorama,
  onSelectPoi,
  editable = false,
  onAddHotspot,
  onDeleteHotspot,
  initialYawDeg = 0,
}: PanoramaViewerProps) => {
  const [panoZoom, setPanoZoom] = useState(110);
  const [rotationX, setRotationX] = useState(-initialYawDeg * 2);
  const [rotationY, setRotationY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [activePoiCardId, setActivePoiCardId] = useState<string | null>(null);
  const [editorKind, setEditorKind] = useState<'poi' | 'transition'>('poi');
  const [editorTargetId, setEditorTargetId] = useState<string>('');

  if (!isOpen) return null;

  const currentHotspots = panorama ? hotspots.filter((h) => h.panorama_id === panorama.id) : [];

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setStartX(clientX - rotationX);
    setStartY(clientY - rotationY);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setRotationX(clientX - startX);
    setRotationY(Math.max(-150, Math.min(150, clientY - startY)));
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const zoomIn = () => setPanoZoom((z) => Math.min(z + 25, 225));
  const zoomOut = () => setPanoZoom((z) => Math.max(z - 25, 75));

  const currentYaw = normalizeYaw(-rotationX / 2);

  const handleViewportDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable || !panorama || !onAddHotspot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = 0.5 - (e.clientY - rect.top) / rect.height;
    const yaw = normalizeYaw(currentYaw + relX * 120);
    const pitch = Math.max(-85, Math.min(85, Math.round(relY * 90)));

    if (editorKind === 'poi') {
      const targetPoiId = editorTargetId || pois[0]?.id;
      if (!targetPoiId) return;
      onAddHotspot({
        panorama_id: panorama.id,
        kind: 'poi',
        yaw_deg: Math.round(yaw * 10) / 10,
        pitch_deg: pitch,
        poi_id: targetPoiId,
        target_panorama_id: null,
      });
    } else {
      const targetPano =
        panoramas.find((p) => p.id === editorTargetId && p.id !== panorama.id) ||
        panoramas.find((p) => p.id !== panorama.id);
      if (!targetPano) return;
      onAddHotspot({
        panorama_id: panorama.id,
        kind: 'transition',
        yaw_deg: Math.round(yaw * 10) / 10,
        pitch_deg: pitch,
        poi_id: null,
        target_panorama_id: targetPano.id,
      });
    }
  };

  const activePoi = activePoiCardId ? pois.find((p) => p.id === activePoiCardId) : null;
  const activeRichPoi = activePoiCardId ? richPois.find((p) => p.id === activePoiCardId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4">
      <div className="bg-slate-900 rounded-2xl sm:rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col h-[82vh] max-h-[640px] relative animate-modal-enter">
        {/* Header */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-white z-10">
          <div className="flex items-center gap-3">
            <Icon name="rotate-3d" className="w-5 h-5 text-brand-500" />
            <div>
              <h3 className="font-bold text-base">{title || 'Панорама 360°'}</h3>
              <p className="text-[11px] text-slate-400">
                Азимут: {Math.round(currentYaw)}° • Масштаб: {panoZoom}% • Перетаскивайте мышью или пальцем для обзора 360°
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition"
              title="Отдалить"
            >
              <Icon name="zoom-out" className="w-4 h-4" />
            </button>
            <button
              onClick={zoomIn}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition"
              title="Приблизить"
            >
              <Icon name="zoom-in" className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition"
              aria-label="Закрыть панораму"
            >
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editable Hotspot Toolbar */}
        {editable && panorama && (
          <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center gap-3 text-xs text-slate-200 z-10">
            <span className="font-semibold text-brand-500">Разметка хотспотов (двойной клик по панораме):</span>
            <select
              value={editorKind}
              onChange={(e) => setEditorKind(e.target.value as 'poi' | 'transition')}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs"
            >
              <option value="poi">Инфо-точка (POI)</option>
              <option value="transition">Переход к панораме</option>
            </select>
            {editorKind === 'poi' ? (
              <select
                value={editorTargetId}
                onChange={(e) => setEditorTargetId(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs"
              >
                {pois.map((poi) => (
                  <option key={poi.id} value={poi.id}>
                    {poi.title}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={editorTargetId}
                onChange={(e) => setEditorTargetId(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs"
              >
                {panoramas
                  .filter((p) => p.id !== panorama.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
            )}
          </div>
        )}

        {/* 360 Viewport */}
        <div
          className="flex-1 relative overflow-hidden pano-viewport"
          onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleDragMove(e.clientX, e.clientY)}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchStart={(e) => e.touches[0] && handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => e.touches[0] && handleDragMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleDragEnd}
          onDoubleClick={handleViewportDoubleClick}
        >
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-75"
            style={{
              backgroundImage: `url(${imageUrl})`,
              transform: `scale(${panoZoom / 100}) translate(${rotationX}px, ${rotationY}px)`,
            }}
          />

          {/* Interactive Hotspots Overlay */}
          {currentHotspots.map((hs) => {
            const deltaYaw = normalizeYaw(hs.yaw_deg - currentYaw);
            const leftPct = 50 + (deltaYaw / 180) * 80;
            const topPct = 50 - (hs.pitch_deg / 90) * 40 + rotationY / 10;
            if (leftPct < 5 || leftPct > 95) return null;

            const linkedPoi = hs.kind === 'poi' ? pois.find((p) => p.id === hs.poi_id) : null;
            const linkedPano =
              hs.kind === 'transition' ? panoramas.find((p) => p.id === hs.target_panorama_id) : null;
            const label =
              hs.kind === 'poi'
                ? linkedPoi?.title || 'Точка интереса'
                : `Переход: ${linkedPano?.title || 'Соседняя панорама'}`;

            return (
              <div
                key={hs.id}
                style={{ left: `${leftPct}%`, top: `${Math.max(12, Math.min(88, topPct))}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hs.kind === 'poi' && hs.poi_id) {
                      setActivePoiCardId(hs.poi_id);
                      onSelectPoi?.(hs.poi_id);
                    } else if (hs.kind === 'transition' && hs.target_panorama_id) {
                      onSelectPanorama?.(hs.target_panorama_id);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-1.5 transition hover:scale-105 ${
                    hs.kind === 'transition'
                      ? 'bg-brand-600/90 text-white border border-white/30'
                      : 'bg-white/90 text-slate-900 border border-brand-600'
                  }`}
                >
                  <Icon name={hs.kind === 'transition' ? 'arrow-right' : 'map-pin'} className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
                {editable && onDeleteHotspot && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteHotspot(hs.id);
                    }}
                    className="p-1 bg-red-600 text-white rounded-full shadow"
                    title="Удалить хотспот"
                  >
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Active POI Info Card inside Panorama (reads current POI data, not a stale copy) */}
          {(activePoi || activeRichPoi) && (
            <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 bg-slate-950/90 text-white p-4 rounded-2xl border border-slate-700 backdrop-blur-md z-30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{activePoi?.title ?? activeRichPoi?.name}</span>
                <button onClick={() => setActivePoiCardId(null)} className="text-slate-400 hover:text-white">
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300">{activePoi?.description ?? activeRichPoi?.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
