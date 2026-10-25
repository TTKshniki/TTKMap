import React from 'react';
import { X, Rotate3d, Bell } from '../icons';
import {
  Language,
  PoiItem,
  SpaceItem,
} from '../types';

interface ModalsProps {
  lang: Language;
  panoramaModalOpen: boolean;
  setPanoramaModalOpen: (open: boolean) => void;
  activePanoramaPoi: PoiItem | null;
  currentSpace: SpaceItem;
  panoZoom: number;
  panoRotationX: number;
  panoRotationY: number;
  startPanoDrag: (e: React.MouseEvent | React.TouchEvent) => void;
  onPanoDrag: (e: React.MouseEvent | React.TouchEvent) => void;
  stopPanoDrag: () => void;
  notificationOpen: boolean;
  notificationText: string;
}

export const Modals: React.FC<ModalsProps> = ({
  lang,
  panoramaModalOpen,
  setPanoramaModalOpen,
  activePanoramaPoi,
  currentSpace,
  panoZoom,
  panoRotationX,
  panoRotationY,
  startPanoDrag,
  onPanoDrag,
  stopPanoDrag,
  notificationOpen,
  notificationText,
}) => {
  return (
    <>
      {/* МОДАЛЬНОЕ ОКНО: 360° ПАНОРАМНЫЙ ПРОСМОТР */}
      {panoramaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-slate-900 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col h-[600px] relative">
            <div className="p-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-white z-10">
              <div className="flex items-center space-x-2">
                <Rotate3d className="w-4 h-4 text-brand-500" />
                <h3 className="font-bold text-sm">
                  {activePanoramaPoi
                    ? activePanoramaPoi.name[lang]
                    : 'Панорама 360°'}
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded">360° VR</span>
              </div>
              <button
                onClick={() => setPanoramaModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="flex-1 relative overflow-hidden pano-viewport bg-slate-800"
              onMouseDown={startPanoDrag}
              onMouseMove={onPanoDrag}
              onMouseUp={stopPanoDrag}
              onMouseLeave={stopPanoDrag}
              onTouchStart={startPanoDrag}
              onTouchMove={onPanoDrag}
              onTouchEnd={stopPanoDrag}
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-75 ease-out"
                style={{
                  backgroundImage: `url(${
                    activePanoramaPoi
                      ? activePanoramaPoi.image
                      : currentSpace.image
                  })`,
                  transform: `scale(${
                    panoZoom / 100
                  }) translate(${panoRotationX}px, ${panoRotationY}px)`,
                }}
              />
            </div>
          </div>
        </div>
      )}

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
