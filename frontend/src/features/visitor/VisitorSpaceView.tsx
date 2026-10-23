import React from 'react';
import type { PublicMap, RouteResponse } from '../../../../CONTRACTS/types';
import { Icon } from '../../shared/Icon';
import { i18n, Lang, RichPoiItem, SpaceDefinition } from '../../shared/spacesData';

export interface SpacesHeroViewProps {
  lang: Lang;
  spaceList: string[];
  spacesData: Record<string, SpaceDefinition>;
  currentSpaceKey: string;
  onPrevSpace: () => void;
  onNextSpace: () => void;
  onSelectSpace: (key: string) => void;
  onOpenSpaceFullPage: (key: string) => void;
  onOpenMap: () => void;
  onOpenPhotoSearch: () => void;
}

export const SpacesHeroView: React.FC<SpacesHeroViewProps> = ({
  lang,
  spaceList,
  spacesData,
  currentSpaceKey,
  onPrevSpace,
  onNextSpace,
  onSelectSpace,
  onOpenSpaceFullPage,
  onOpenMap,
  onOpenPhotoSearch,
}: SpacesHeroViewProps) => {
  const t = i18n[lang];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar animate-view-enter">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 pb-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl sm:rounded-3xl p-6 sm:p-10 lg:p-12 shadow-xl relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-600/20 blur-3xl pointer-events-none" />
          <div className="max-w-2xl relative z-10 space-y-3 sm:space-y-4">
            <span className="inline-block bg-brand-600 text-white text-[11px] sm:text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
              Интерактивный навигатор ТТК
            </span>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
              {t.heroTitle}
            </h1>
            <p className="text-slate-300 text-sm sm:text-base lg:text-lg leading-relaxed">{t.heroDesc}</p>
            <div className="pt-2 sm:pt-4 flex flex-wrap gap-3 sm:gap-4">
              <button
                onClick={onOpenMap}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl shadow-lg transition flex items-center gap-2 text-sm sm:text-base"
              >
                <Icon name="map" className="w-5 h-5 shrink-0" /> <span>{t.openMapBtn}</span>
              </button>
              <button
                onClick={onOpenPhotoSearch}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl backdrop-blur-md transition flex items-center gap-2 text-sm sm:text-base"
              >
                <Icon name="camera" className="w-5 h-5 text-brand-500 shrink-0" /> <span>{t.searchPhotoBtn}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Spaces Carousel Section (Avito Style) */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 sm:mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{t.spacesTitle}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.spacesSub}</p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={onPrevSpace}
                className="p-2.5 sm:p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm transition"
                aria-label="Предыдущее пространство"
              >
                <Icon name="arrow-left" className="w-5 h-5" />
              </button>
              <button
                onClick={onNextSpace}
                className="p-2.5 sm:p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm transition"
                aria-label="Следующее пространство"
              >
                <Icon name="arrow-right" className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Spaces Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {spaceList.map((key) => {
              const space = spacesData[key];
              if (!space) return null;
              return (
                <div
                  key={key}
                  className={`card-interactive bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-xl cursor-pointer group flex flex-col ${
                    currentSpaceKey === key ? 'ring-2 ring-brand-600' : ''
                  }`}
                >
                  <div
                    className="h-44 sm:h-48 bg-slate-200 dark:bg-slate-700 relative overflow-hidden shrink-0"
                    onClick={() => onOpenSpaceFullPage(key)}
                  >
                    <img
                      src={space.image}
                      alt={space.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                    <div className="absolute top-3 left-3 bg-brand-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow">
                      {space.type}
                    </div>
                    <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-lg font-bold">
                      {space.price}
                    </div>
                  </div>
                  <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div onClick={() => onOpenSpaceFullPage(key)}>
                      <h3 className="text-lg sm:text-xl font-bold group-hover:text-brand-600 transition line-clamp-1">
                        {space.name}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mt-1 line-clamp-3">
                        {space.desc}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100 dark:border-slate-700 text-sm">
                      <button
                        onClick={() => onSelectSpace(key)}
                        className="text-brand-600 font-semibold hover:underline flex items-center gap-1 text-xs sm:text-sm"
                      >
                        <Icon name="map" className="w-4 h-4 shrink-0" /> <span>На карту</span>
                      </button>
                      <button
                        onClick={() => onOpenSpaceFullPage(key)}
                        className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1"
                      >
                        <span>Обзор и 360°</span> <Icon name="arrow-right" className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface MapNavigationViewProps {
  lang: Lang;
  currentSpace: SpaceDefinition;
  publicSnapshot: PublicMap | null;
  activeBuilding: string;
  activeFloor: number;
  zoomLevel: number;
  routeActive: boolean;
  routeFrom: string;
  routeTo: string;
  routeResponse: RouteResponse | null;
  walkStepIndex: number;
  selectedPoi: RichPoiItem | null;
  isEmbed?: boolean;
  isFavorite: (id: string) => boolean;
  onChangeBuilding: (b: string) => void;
  onChangeFloor: (f: number) => void;
  onChangeRouteFrom: (id: string) => void;
  onChangeRouteTo: (id: string) => void;
  onBuildRoute: (targetPoiId?: string) => void;
  onClearRoute: () => void;
  onSelectPoi: (poi: RichPoiItem) => void;
  onOpenPanorama: (poi: RichPoiItem) => void;
  onStartWalkthroughStep: (index: number) => void;
  onToggleFavorite: (id: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export const MapNavigationView: React.FC<MapNavigationViewProps> = ({
  lang,
  currentSpace,
  publicSnapshot,
  activeBuilding,
  activeFloor,
  zoomLevel,
  routeActive,
  routeFrom,
  routeTo,
  routeResponse,
  walkStepIndex,
  selectedPoi,
  isEmbed = false,
  isFavorite,
  onChangeBuilding,
  onChangeFloor,
  onChangeRouteFrom,
  onChangeRouteTo,
  onBuildRoute,
  onClearRoute,
  onSelectPoi,
  onOpenPanorama,
  onStartWalkthroughStep,
  onToggleFavorite,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: MapNavigationViewProps) => {
  const t = i18n[lang];
  const floors = currentSpace.buildings[activeBuilding]?.floors ?? [1];
  const visiblePois = currentSpace.pois.filter(
    (p) => p.building === activeBuilding && p.floor === activeFloor,
  );
  const poisToRender = visiblePois.length > 0 ? visiblePois : currentSpace.pois;

  const polylinePoints =
    routeResponse && routeResponse.polyline.length >= 2
      ? routeResponse.polyline.map((pt) => `${pt.x},${pt.y}`).join(' ')
      : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative animate-view-enter">
      {/* Left Controls Sidebar */}
      <div
        className={`${
          isEmbed ? 'w-full lg:w-72' : 'w-full lg:w-80 xl:w-96'
        } shrink-0 bg-white dark:bg-slate-800 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700 flex flex-col z-20 shadow-sm lg:shadow-lg lg:h-full lg:overflow-y-auto custom-scrollbar`}
      >
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-700 space-y-3">
          {/* Building Switcher */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">
              {t.buildingLabel}
            </span>
            <select
              value={activeBuilding}
              onChange={(e) => onChangeBuilding(e.target.value)}
              className="bg-slate-100 dark:bg-slate-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 truncate max-w-[200px]"
            >
              {Object.entries(currentSpace.buildings).map(([bKey, bld]) => (
                <option key={bKey} value={bKey}>
                  {bld.name}
                </option>
              ))}
            </select>
          </div>

          {/* Floor Switcher */}
          <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl gap-1">
            {floors.map((floor) => (
              <button
                key={floor}
                onClick={() => onChangeFloor(floor)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs transition text-center whitespace-nowrap ${
                  activeFloor === floor
                    ? 'bg-white dark:bg-slate-600 text-brand-600 font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-600/50'
                }`}
              >
                {t.floorLabel} {floor}
              </button>
            ))}
          </div>
        </div>

        {/* Route Builder Box */}
        <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Icon name="navigation" className="w-4 h-4 text-brand-600" /> <span>{t.routeTitle}</span>
            </h3>
            {routeActive && (
              <button onClick={onClearRoute} className="text-xs text-red-500 hover:underline font-medium">
                {t.resetBtn}
              </button>
            )}
          </div>

          <div className="space-y-2">
            <select
              value={routeFrom}
              onChange={(e) => onChangeRouteFrom(e.target.value)}
              className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-xs"
            >
              <option value="">{t.routeFrom}</option>
              {currentSpace.pois.map((poi) => (
                <option key={poi.id} value={poi.id}>
                  {poi.name} (Корп. {poi.building}, Эт. {poi.floor})
                </option>
              ))}
            </select>
            <select
              value={routeTo}
              onChange={(e) => onChangeRouteTo(e.target.value)}
              className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-xs"
            >
              <option value="">{t.routeTo}</option>
              {currentSpace.pois.map((poi) => (
                <option key={poi.id} value={poi.id}>
                  {poi.name} (Корп. {poi.building}, Эт. {poi.floor})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => onBuildRoute()}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-1.5"
          >
            <Icon name="route" className="w-4 h-4" /> <span>{t.buildRouteBtn}</span>
          </button>

          {/* Server Dijkstra Route Summary & Panorama Walkthrough */}
          {routeActive && routeResponse && (
            <div className="p-3 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs space-y-2 animate-view-enter">
              <div className="flex items-center justify-between font-semibold">
                <span>Дистанция маршрута:</span>
                <span className="text-brand-600">
                  {routeResponse.distance_m !== null
                    ? `${routeResponse.distance_m.toFixed(1)} м`
                    : `${Math.round(routeResponse.distance_units)} ед.`}
                </span>
              </div>
              {routeResponse.walk.available ? (
                <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-600">
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    Виртуальный проход по панорамам ({routeResponse.walk.steps.length} шага):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {routeResponse.walk.steps.map((step, idx) => (
                      <button
                        key={step.node_id}
                        onClick={() => onStartWalkthroughStep(idx)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          walkStepIndex === idx
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        Шаг {idx + 1} ({Math.round(step.yaw_deg)}°)
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                routeResponse.walk.gaps.length > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    2D-маршрут построен. Панорамный проход недоступен ({routeResponse.walk.gaps[0].reason}).
                  </p>
                )
              )}
            </div>
          )}
        </div>

        {/* Selected Point Detail Card */}
        <div className="p-3.5 sm:p-4 flex-1 space-y-3">
          {selectedPoi && (
            <div className="space-y-3 bg-white dark:bg-slate-700 rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden shadow-sm animate-view-enter">
              <div className="h-32 sm:h-36 relative">
                <img src={selectedPoi.image} alt={selectedPoi.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => onOpenPanorama(selectedPoi)}
                  className="absolute bottom-3 right-3 bg-black/75 hover:bg-black text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-md flex items-center gap-1.5 font-medium shadow"
                >
                  <Icon name="rotate-3d" className="w-3.5 h-3.5" /> <span>{t.panoBtn}</span>
                </button>

                <button
                  onClick={() => onToggleFavorite(selectedPoi.id)}
                  className="absolute top-3 right-3 p-2 rounded-full bg-white/85 dark:bg-slate-800/85 shadow-md transition"
                  aria-label="В избранное"
                >
                  <Icon
                    name="heart"
                    className={`w-4 h-4 transition-colors duration-150 ${
                      isFavorite(selectedPoi.id) ? 'fill-red-500 text-red-500' : 'text-slate-400'
                    }`}
                  />
                </button>
              </div>
              <div className="p-3.5 sm:p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm sm:text-base leading-snug">{selectedPoi.name}</h3>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                    {selectedPoi.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  Корпус {selectedPoi.building}, Этаж {selectedPoi.floor}
                </p>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-600 text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Icon name="users" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {t.capacity}: {selectedPoi.capacity}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon name="tv" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="line-clamp-2">
                      {t.equipment}: {selectedPoi.equipment}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon name="wifi" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {t.wifi}: {selectedPoi.wifi}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onBuildRoute(selectedPoi.id)}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-xl text-xs font-semibold transition mt-2 shadow-sm"
                >
                  {t.routeHere}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2D Canvas Viewport with Zoom In/Out Controls */}
      <div className="flex-1 min-w-0 min-h-[420px] lg:min-h-0 bg-slate-100 dark:bg-slate-900 relative flex items-center justify-center p-3 sm:p-5 lg:p-6 overflow-hidden select-none">
        <div className="relative w-full max-w-5xl bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full max-h-[820px]">
          {/* Toolbar Zoom Buttons */}
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 z-10 shrink-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-bold text-sm sm:text-base truncate">{currentSpace.name}</span>
              <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
                Корпус {activeBuilding} • Этаж {activeFloor}
              </span>
              {publicSnapshot && (
                <span className="text-[11px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold hidden sm:inline-block whitespace-nowrap">
                  Live API v{publicSnapshot.revision}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
              <button
                onClick={onZoomIn}
                className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                title="Приблизить"
              >
                <Icon name="zoom-in" className="w-4 h-4" />
              </button>
              <button
                onClick={onZoomOut}
                className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                title="Отдалить"
              >
                <Icon name="zoom-out" className="w-4 h-4" />
              </button>
              <button
                onClick={onResetZoom}
                className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                title="Сбросить масштаб"
              >
                <Icon name="maximize-2" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive SVG Plan — Responsive Aspect Ratio Container */}
          <div className="flex-1 min-h-0 relative overflow-auto flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-3 sm:p-6 custom-scrollbar">
            <div
              className="relative map-stage-aspect transition-transform duration-300 origin-center"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <svg
                className="w-full h-full block bg-white dark:bg-slate-800 rounded-2xl shadow-inner border border-slate-200 dark:border-slate-700"
                viewBox="0 0 700 500"
                preserveAspectRatio="xMidYMid meet"
              >
                <rect x="40" y="40" width="620" height="420" rx="16" stroke="#94a3b8" strokeWidth="4" fill="none" />
                <line x1="220" y1="40" x2="220" y2="460" stroke="#cbd5e1" strokeWidth="3" />
                <line x1="480" y1="40" x2="480" y2="250" stroke="#cbd5e1" strokeWidth="3" />
                <line x1="220" y1="250" x2="660" y2="250" stroke="#cbd5e1" strokeWidth="3" />

                <text x="120" y="100" fill="#64748b" fontSize="12" fontWeight="600">
                  Зона ресепшн
                </text>
                <text x="290" y="100" fill="#64748b" fontSize="12" fontWeight="600">
                  Переговорная Альфа
                </text>

                {/* Custom shapes from live backend document */}
                {publicSnapshot?.document.shapes.map((shape) => {
                  const pts = shape.points.map((p) => `${p.x},${p.y}`).join(' ');
                  return shape.kind === 'wall' ? (
                    <polyline key={shape.id} points={pts} fill="none" stroke="#94a3b8" strokeWidth="3" />
                  ) : (
                    <polygon
                      key={shape.id}
                      points={pts}
                      fill="rgba(227, 27, 35, 0.04)"
                      stroke="#cbd5e1"
                      strokeWidth="2"
                    />
                  );
                })}

                {routeActive &&
                  (polylinePoints ? (
                    <polyline
                      points={polylinePoints}
                      stroke="#ef4444"
                      strokeWidth="4"
                      strokeDasharray="6 6"
                      fill="none"
                      className="animate-route"
                    />
                  ) : (
                    <path
                      d="M 120 120 Q 200 150 320 120 T 540 320"
                      stroke="#ef4444"
                      strokeWidth="4"
                      strokeDasharray="6 6"
                      fill="none"
                      className="animate-route"
                    />
                  ))}
              </svg>

              {/* POI Pins overlay */}
              {poisToRender.map((poi) => {
                const isSelected = selectedPoi?.id === poi.id;
                return (
                  <div
                    key={poi.id}
                    onClick={() => onSelectPoi(poi)}
                    className="absolute cursor-pointer group transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-200 hover:scale-110 z-10"
                    style={{ left: `${poi.x}%`, top: `${poi.y}%` }}
                  >
                    {isSelected && (
                      <span className="absolute inset-0 rounded-full bg-brand-600/40 animate-pulse-ring pointer-events-none" />
                    )}
                    <div
                      className={`relative border-2 border-brand-600 rounded-full p-2 shadow-lg flex items-center justify-center transition-all duration-200 ${
                        isSelected
                          ? 'bg-brand-600 text-white scale-125'
                          : 'bg-white dark:bg-slate-800 text-brand-600'
                      }`}
                    >
                      <Icon name={poi.icon || 'map-pin'} className="w-4 h-4" />
                    </div>
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap shadow-md pointer-events-none transition-opacity duration-200 ${
                        isSelected
                          ? 'opacity-100 bg-slate-900 text-white'
                          : 'opacity-0 group-hover:opacity-100 bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {poi.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
