import React from 'react';
import { Bell } from '../icons';
import {
  Language,
  PoiItem,
  SpaceItem,
} from '../types';
import type { PublicMap } from '../../../../CONTRACTS/types';
import { PanoramaViewer } from '../../features/panorama/Viewer';

interface ModalsProps {
  lang: Language;
  panoramaModalOpen: boolean;
  setPanoramaModalOpen: (open: boolean) => void;
  activePanoramaPoi: PoiItem | null;
  currentSpace: SpaceItem;
  publicMap?: PublicMap | null;
  activePanoramaId?: string | null;
  onSelectPanorama?: (panoramaId: string) => void;
  onSelectPoi?: (poi: PoiItem) => void;
  panoZoom?: number;
  panoRotationX?: number;
  panoRotationY?: number;
  startPanoDrag?: (e: React.MouseEvent | React.TouchEvent) => void;
  onPanoDrag?: (e: React.MouseEvent | React.TouchEvent) => void;
  stopPanoDrag?: () => void;
  notificationOpen: boolean;
  notificationText: string;
}

export const Modals: React.FC<ModalsProps> = ({
  lang,
  panoramaModalOpen,
  setPanoramaModalOpen,
  activePanoramaPoi,
  currentSpace,
  publicMap,
  activePanoramaId,
  onSelectPanorama,
  onSelectPoi,
  notificationOpen,
  notificationText,
}) => {
  const currentPanorama =
    publicMap?.document.panoramas.find((p: { id: string }) => p.id === activePanoramaId) ??
    publicMap?.document.panoramas[0] ??
    null;

  const currentAsset = currentPanorama
    ? publicMap?.assets.find((a: { id: string }) => a.id === currentPanorama.asset_id)
    : null;

  const imageUrl =
    currentAsset?.mobile_url ||
    currentAsset?.full_url ||
    (activePanoramaPoi ? activePanoramaPoi.image : currentSpace.image);

  const title =
    currentPanorama?.title ||
    (activePanoramaPoi ? activePanoramaPoi.name[lang] : currentSpace.name[lang]) ||
    'Панорама 360°';

  return (
    <>
      {/* МОДАЛЬНОЕ ОКНО: 360° ПАНОРАМНЫЙ ПРОСМОТР ЧЕРЕЗ PANNELLUM & BACKEND API */}
      <PanoramaViewer
        isOpen={panoramaModalOpen}
        onClose={() => setPanoramaModalOpen(false)}
        title={title}
        imageUrl={imageUrl}
        panorama={currentPanorama}
        panoramas={publicMap?.document.panoramas ?? []}
        hotspots={publicMap?.document.hotspots ?? []}
        pois={publicMap?.document.pois ?? []}
        richPois={
          currentSpace.pois?.map((p) => ({
            id: String(p.id),
            name: p.name[lang],
            categoryName: p.categoryName[lang],
            description: `${p.categoryName[lang]} • ${p.capacity} • ${p.statusText[lang]}`,
            equipment: p.equipment,
            wifi: p.wifi,
            image: p.image,
          })) ?? []
        }
        assets={publicMap?.assets ?? []}
        onSelectPanorama={(targetId) => onSelectPanorama?.(targetId)}
        onSelectPoi={(poiId) => {
          const found = currentSpace.pois?.find((p) => String(p.id) === poiId);
          if (found) {
            setPanoramaModalOpen(false);
            onSelectPoi?.(found);
          }
        }}
      />

      {/* Уведомления системы Toast */}
      {notificationOpen && (
        <div className="fixed bottom-12 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2.5 text-xs font-medium border border-slate-800 animate-bounce">
          <Bell className="w-3.5 h-3.5 text-brand-500" />
          <span>{notificationText}</span>
        </div>
      )}
    </>
  );
};
