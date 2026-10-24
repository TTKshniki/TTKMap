import React, { useState } from 'react';
import type { PublicMap, RouteResponse } from '../../../../CONTRACTS/types';
import { Icon } from '../../shared/Icon';
import {
  i18n,
  Lang,
  poiName,
  poiStatus,
  RichPoiItem,
  spaceDesc,
   SpaceDefinition,
  spaceName,
  spaceType,
} from '../../shared/spacesData';

export interface SpacesHeroViewProps {
  lang: Lang;
  spaceList: string[];
  spacesData: Record<string, SpaceDefinition>;
  currentSpaceKey: string;
  carouselIndex?: number;
  isFavorite?: (id: string) => boolean;
  onToggleFavorite?: (id: string) => void;
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
  carouselIndex = 0,
  isFavorite,
  onToggleFavorite,
  onPrevSpace,
  onNextSpace,
  onSelectSpace,
  onOpenSpaceFullPage,
  onOpenMap,
  onOpenPhotoSearch,
}: SpacesHeroViewProps) => {
  const t = i18n[lang];

  return (
    <div className="p-4 sm:p-8 lg:p-10 custom-scrollbar animate-view-enter">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Hero Banner with Soft Dark Glow & Gradient */}
        <div className="bg-slate-950 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-white rounded-3xl shadow-2xl border border-slate-800 grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-[380px] relative">
          <div className="absolute inset-0 bg-gradient-to-r from-brand-600/15 via-slate-900/40 to-transparent pointer-events-none dark:block hidden" />

          <div className="p-8 sm:p-10 lg:p-14 flex flex-col justify-between space-y-6 z-10 bg-slate-950/80 dark:bg-transparent border-r-0 lg:border-r border-slate-800/80">
            <div className="space-y-4">
              <span className="bg-brand-600 text-white text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider inline-block shadow-md">
                {lang === 'ru' ? 'ИНТЕРАКТИВНЫЙ НАВИГАТОР ТТК' : 'TTK INTERACTIVE NAVIGATOR'}
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
                {t.heroTitle}
              </h1>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">{t.heroDesc}</p>
            </div>
            <div className="pt-2 flex flex-wrap gap-4">
              <button
                onClick={onOpenMap}
                className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-6 py-3 rounded-2xl shadow-xl transition-all hover:scale-105 text-sm flex items-center gap-2.5"
              >
                <Icon name="map" className="w-4 h-4 shrink-0" />
                <span>{t.openMapBtn}</span>
              </button>
              <button
                onClick={onOpenPhotoSearch}
                className="bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700 font-bold px-6 py-3 rounded-2xl backdrop-blur-md transition-all hover:scale-105 text-sm flex items-center gap-2.5 shadow-lg"
              >
                <Icon name="camera" className="w-4 h-4 text-slate-300 shrink-0" />
                <span>{t.searchPhotoBtn}</span>
              </button>
            </div>
          </div>

          <div
            className="relative bg-cover bg-center min-h-[260px] lg:min-h-full"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80')",
            }}
          >
            <div className="absolute inset-0 bg-slate-950/60 mix-blend-multiply" />
          </div>
        </div>

        {/* Spaces Carousel / Grid */}
        <div>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{t.spacesTitle}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t.spacesSub}</p>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-xs font-bold text-slate-400">
                {carouselIndex + 1} / {spaceList.length}
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={onPrevSpace}
                  className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 shadow-sm transition"
                  aria-label="Предыдущее пространство"
                >
                  <Icon name="chevron-left" className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
                <button
                  onClick={onNextSpace}
                  className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 shadow-sm transition"
                  aria-label="Следующее пространство"
                >
                  <Icon name="chevron-right" className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {spaceList.map((key) => {
              const space = spacesData[key];
              if (!space) return null;
              const fav = isFavorite ? isFavorite(space.id) : false;
              return (
                <div
                  key={key}
                  onClick={() => onSelectSpace(key)}
                  className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group flex flex-col relative ${
                    currentSpaceKey === key ? 'ring-2 ring-brand-600' : ''
                  }`}
                >
                  <div className="h-52 bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                    <img
                      src={space.image}
                      alt={spaceName(space, lang)}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />

                    <div className="absolute top-3 left-3 bg-brand-600 text-white text-[11px] font-bold px-3 py-1 rounded-xl uppercase tracking-wider shadow">
                      {spaceType(space, lang)}
                    </div>

                    {onToggleFavorite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(space.id);
                        }}
                        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-md flex items-center justify-center transition hover:scale-110"
                        aria-label="Избранное"
                      >
                        <Icon
                          name="heart"
                          className={`w-4 h-4 transition-colors ${
                            fav ? 'fill-rose-500 text-rose-500' : 'fill-transparent text-slate-500'
                          }`}
                        />
                      </button>
                    )}

                    <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md text-white text-xs px-3.5 py-1.5 rounded-xl font-bold">
                      {space.price}
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
                        <span>★</span>
                        <span>{space.rating}</span>
                        <span className="text-slate-400 font-normal">({space.reviewsCount})</span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-brand-600 transition">
                        {spaceName(space, lang)}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed line-clamp-2">
                        {spaceDesc(space, lang)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSpace(key);
                        }}
                        className="text-brand-600 font-bold hover:underline flex items-center gap-1.5"
                      >
                        <Icon name="map" className="w-3.5 h-3.5" />
                        <span>{lang === 'ru' ? 'Открыть карту' : 'Open Map'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSpaceFullPage(key);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs"
                      >
                        <span>{lang === 'ru' ? 'Панорама 360°' : '360° Panorama'}</span>
                        <Icon name="rotate-3d" className="w-3.5 h-3.5" />
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
  onBackToSpaces?: () => void;
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
  onBackToSpaces,
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
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'meeting' | 'entrance' | 'service'>('all');

  const floors = currentSpace.buildings[activeBuilding]?.floors ?? [1];
  const categoryFilteredPois = currentSpace.pois.filter((p) => {
    if (selectedCategory === 'all') return true;
    if (p.filterCategory) return p.filterCategory === selectedCategory;
    if (selectedCategory === 'entrance') return p.category === 'entrance';
    if (selectedCategory === 'meeting') return p.category === 'hall';
    return p.category === 'service_desk' || p.category === 'booth' || p.category === 'wifi' || p.category === 'custom';
  });

  const poisToRender = categoryFilteredPois.length > 0 ? categoryFilteredPois : currentSpace.pois;
  const activePoi = selectedPoi ?? poisToRender[0] ?? currentSpace.pois[0] ?? null;

  // Map polyline from backend (700x500) to SVG viewport (720x400)
  const scaleX = 720 / (publicSnapshot?.width_units || 700);
  const scaleY = 400 / (publicSnapshot?.height_units || 500);
  const polylinePoints =
    routeResponse && routeResponse.polyline.length >= 2
      ? routeResponse.polyline
          .map((pt) => `${Math.round(pt.x * scaleX)},${Math.round(pt.y * scaleY)}`)
          .join(' ')
      : null;

  const equipmentItems = (activePoi?.equipment || 'Стойка информации, Турникеты, Инфо-терминал')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-[600px] animate-view-enter">
      {/* Left Sidebar */}
      <div
        className={`${
          isEmbed ? 'w-full md:w-72' : 'w-full md:w-80 lg:w-96'
        } bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-20 shadow-lg overflow-y-auto custom-scrollbar shrink-0`}
      >
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider block truncate">
                {spaceType(currentSpace, lang)}
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                {spaceName(currentSpace, lang)}
              </h2>
            </div>
            {onBackToSpaces && !isEmbed && (
              <button
                onClick={onBackToSpaces}
                className="text-xs text-slate-500 hover:text-brand-600 flex items-center gap-1 font-semibold shrink-0"
              >
                <Icon name="arrow-left" className="w-3 h-3" />
                <span>{lang === 'ru' ? 'Сменить' : 'Change'}</span>
              </button>
            )}
          </div>

          {/* Building selector when space has multiple buildings */}
          {Object.keys(currentSpace.buildings).length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                {t.buildingLabel}
              </span>
              <select
                value={activeBuilding}
                onChange={(e) => onChangeBuilding(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 text-xs font-semibold rounded-xl px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 truncate max-w-[210px]"
              >
                {Object.entries(currentSpace.buildings).map(([bKey, bld]) => (
                  <option key={bKey} value={bKey}>
                    {lang === 'en' && bld.nameEn ? bld.nameEn : bld.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Floor Switcher */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {floors.map((floor) => (
              <button
                key={floor}
                onClick={() => onChangeFloor(floor)}
                className={`flex-1 py-1.5 rounded-lg text-xs transition text-center ${
                  activeFloor === floor
                    ? 'bg-white dark:bg-slate-700 text-brand-600 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {(lang === 'en' ? 'Floor ' : 'Этаж ') + floor}
              </button>
            ))}
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs">
            {(
              [
                ['all', lang === 'ru' ? 'Все' : 'All'],
                ['meeting', lang === 'ru' ? 'Переговорные' : 'Meeting'],
                ['entrance', lang === 'ru' ? 'Входы' : 'Entrances'],
                ['service', lang === 'ru' ? 'Стойки' : 'Desks'],
              ] as const
            ).map(([catKey, label]) => (
              <button
                key={catKey}
                onClick={() => {
                  setSelectedCategory(catKey);
                  const matching = currentSpace.pois.find((p) =>
                    catKey === 'all' ? true : p.filterCategory === catKey,
                  );
                  if (matching) onSelectPoi(matching);
                }}
                className={`px-3 py-1 rounded-xl whitespace-nowrap transition ${
                  selectedCategory === catKey
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected POI Detail Card (Update Design) */}
        <div className="p-4 sm:p-5 flex-1 space-y-4">
          {activePoi && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm space-y-3">
              <div className="h-40 relative overflow-hidden bg-slate-900">
                <img
                  src={
                    activePoi.image ||
                    'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80'
                  }
                  alt={poiName(activePoi, lang)}
                  className="w-full h-full object-cover"
                />

                <span className="absolute top-2.5 left-2.5 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow">
                  {lang === 'ru' ? 'ДОСТУПНА 3D' : '3D READY'}
                </span>

                <button
                  onClick={() => onOpenPanorama(activePoi)}
                  className="absolute bottom-2.5 left-2.5 right-2.5 bg-black/75 backdrop-blur-md text-white text-xs py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg border border-white/25 hover:bg-black/90 transition"
                >
                  <Icon name="rotate-3d" className="w-3.5 h-3.5" />
                  <span>{lang === 'ru' ? '360° СМОТРЕТЬ ПАНОРАМУ' : '360° VIEW PANORAMA'}</span>
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                      {poiName(activePoi, lang)}
                    </h3>
                    <p className="text-[11px] font-semibold text-brand-600 mt-0.5 flex items-center gap-1">
                      <Icon name="map-pin" className="w-3 h-3" />
                      <span>
                        {lang === 'ru'
                          ? `Корпус ${activePoi.building}, Этаж ${activePoi.floor}`
                          : `Building ${activePoi.building}, Floor ${activePoi.floor}`}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => onToggleFavorite(activePoi.id)}
                    className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-800 transition ${
                      isFavorite(activePoi.id) ? 'text-rose-500' : 'text-slate-500 hover:text-rose-500'
                    }`}
                    title={lang === 'ru' ? 'В избранное' : 'Bookmark'}
                  >
                    <Icon name="bookmark" className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 text-xs border-t border-b border-slate-100 dark:border-slate-800 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Icon name="users" className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t.capacity}:</span>
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">{activePoi.capacity}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                      <Icon name="monitor" className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t.equipment}:</span>
                    </span>
                    <div className="flex items-center justify-end gap-1.5 font-bold text-slate-900 dark:text-white text-right flex-wrap">
                      {equipmentItems.map((eq, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-slate-300 dark:text-slate-600">•</span>}
                          <span>{eq}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Icon name="activity" className="w-3.5 h-3.5 text-slate-400" />
                      <span>{lang === 'ru' ? 'Статус:' : 'Status:'}</span>
                    </span>
                    <span
                      className={`font-bold flex items-center gap-1 ${
                        activePoi.statusKind === 'busy'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activePoi.statusKind === 'busy' ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                      />
                      <span>{poiStatus(activePoi, lang)}</span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onBuildRoute(activePoi.id)}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-2 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-1.5"
                >
                  <span>{t.buildRouteBtn}</span>
                  <Icon name="navigation" className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Route Builder & Server Dijkstra Walkthrough Panel */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Icon name="route" className="w-3.5 h-3.5 text-brand-600" />
                <span>{t.routeTitle}</span>
              </span>
              {routeActive && (
                <button onClick={onClearRoute} className="text-rose-500 hover:underline font-bold">
                  {t.resetBtn}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <select
                value={routeFrom}
                onChange={(e) => onChangeRouteFrom(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
              >
                <option value="">{t.routeFrom}</option>
                {currentSpace.pois.map((poi) => (
                  <option key={poi.id} value={poi.id}>
                    {poiName(poi, lang)}
                  </option>
                ))}
              </select>
              <select
                value={routeTo}
                onChange={(e) => onChangeRouteTo(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
              >
                <option value="">{t.routeTo}</option>
                {currentSpace.pois.map((poi) => (
                  <option key={poi.id} value={poi.id}>
                    {poiName(poi, lang)}
                  </option>
                ))}
              </select>
            </div>

            {routeActive && routeResponse && (
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between font-bold">
                  <span>{lang === 'ru' ? 'Дистанция:' : 'Distance:'}</span>
                  <span className="text-brand-600">
                    {routeResponse.distance_m !== null
                      ? `${routeResponse.distance_m.toFixed(1)} м`
                      : `${Math.round(routeResponse.distance_units)} ед.`}
                  </span>
                </div>
                {routeResponse.walk.available ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {routeResponse.walk.steps.map((step, idx) => (
                      <button
                        key={step.node_id}
                        onClick={() => onStartWalkthroughStep(idx)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                          walkStepIndex === idx
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {lang === 'ru' ? 'Шаг' : 'Step'} {idx + 1} ({Math.round(step.yaw_deg)}°)
                      </button>
                    ))}
                  </div>
                ) : (
                  routeResponse.walk.gaps.length > 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      {lang === 'ru'
                        ? `2D-маршрут активен (${routeResponse.walk.gaps[0].reason})`
                        : `2D route active (${routeResponse.walk.gaps[0].reason})`}
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Interactive SVG Map */}
      <div className="flex-1 bg-white dark:bg-slate-950 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[520px] relative dark:shadow-[0_0_35px_rgba(249,115,22,0.12)]">
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between z-10">
            <div className="flex items-center space-x-3">
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {spaceName(currentSpace, lang)}
              </span>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full font-medium">
                {(lang === 'ru' ? 'Корпус ' : 'Building ') +
                  activeBuilding +
                  ' • ' +
                  (lang === 'ru' ? 'Этаж ' : 'Floor ') +
                  activeFloor}
              </span>
              {publicSnapshot && (
                <span className="text-[11px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold hidden sm:inline-block">
                  v{publicSnapshot.revision}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={onZoomIn}
                className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                title={lang === 'ru' ? 'Приблизить' : 'Zoom in'}
              >
                <Icon name="zoom-in" className="w-4 h-4" />
              </button>
              <button
                onClick={onZoomOut}
                className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                title={lang === 'ru' ? 'Отдалить' : 'Zoom out'}
              >
                <Icon name="zoom-out" className="w-4 h-4" />
              </button>
              <button
                onClick={onResetZoom}
                className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                title={lang === 'ru' ? 'Сбросить масштаб' : 'Reset zoom'}
              >
                <Icon name="maximize-2" className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-slate-50 dark:bg-slate-900/80 p-4">
            <div
              className="relative transition-transform duration-300"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <svg
                className="w-[720px] h-[400px] max-w-full bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-300 dark:border-slate-700"
                viewBox="0 0 720 400"
              >
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path
                      d="M 20 0 L 0 0 0 20"
                      fill="none"
                      stroke="#f1f5f9"
                      className="dark:stroke-slate-800"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="720" height="400" fill="url(#grid)" />

                {/* Architectural Floor Plan Walls */}
                <path
                  d="M 40,40 L 680,40 L 680,360 L 220,360 L 220,280 L 40,280 Z"
                  fill="none"
                  className="stroke-slate-900 dark:stroke-slate-100"
                  strokeWidth="7"
                  strokeLinejoin="round"
                />

                <line
                  x1="240"
                  y1="40"
                  x2="240"
                  y2="280"
                  className="stroke-slate-900 dark:stroke-slate-100"
                  strokeWidth="4"
                />
                <line
                  x1="420"
                  y1="40"
                  x2="420"
                  y2="200"
                  className="stroke-slate-900 dark:stroke-slate-100"
                  strokeWidth="4"
                />
                <line
                  x1="420"
                  y1="200"
                  x2="680"
                  y2="200"
                  className="stroke-slate-900 dark:stroke-slate-100"
                  strokeWidth="4"
                />
                <line
                  x1="560"
                  y1="40"
                  x2="560"
                  y2="130"
                  className="stroke-slate-900 dark:stroke-slate-100"
                  strokeWidth="3"
                />
                <line
                  x1="560"
                  y1="130"
                  x2="680"
                  y2="130"
                  className="stroke-slate-900 dark:stroke-slate-100"
                  strokeWidth="3"
                />
                <line
                  x1="500"
                  y1="200"
                  x2="500"
                  y2="360"
                  className="stroke-slate-900 dark:stroke-slate-100"
                  strokeWidth="4"
                />

                {/* Orange window borders */}
                <line x1="100" y1="40" x2="180" y2="40" stroke="#f97316" strokeWidth="4" />
                <line x1="280" y1="40" x2="380" y2="40" stroke="#f97316" strokeWidth="4" />
                <line x1="460" y1="40" x2="520" y2="40" stroke="#f97316" strokeWidth="4" />

                {/* Room names */}
                <text
                  x="140"
                  y="165"
                  className="fill-slate-800 dark:fill-slate-200"
                  fontSize="11"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {lang === 'ru' ? 'СПАЛЬНЯ 1' : 'BEDROOM 1'}
                </text>
                <text
                  x="330"
                  y="165"
                  className="fill-slate-800 dark:fill-slate-200"
                  fontSize="11"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {lang === 'ru' ? 'ГОСТИНАЯ' : 'LIVING ROOM'}
                </text>
                <text
                  x="490"
                  y="90"
                  className="fill-slate-800 dark:fill-slate-200"
                  fontSize="10"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {lang === 'ru' ? 'КУХНЯ' : 'KITCHEN'}
                </text>
                <text
                  x="620"
                  y="85"
                  className="fill-slate-800 dark:fill-slate-200"
                  fontSize="9"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {lang === 'ru' ? 'ВАННАЯ' : 'BATHROOM'}
                </text>
                <text
                  x="600"
                  y="280"
                  className="fill-slate-800 dark:fill-slate-200"
                  fontSize="10"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {lang === 'ru' ? 'СПАЛЬНЯ 2' : 'BEDROOM 2'}
                </text>
                <text
                  x="360"
                  y="325"
                  className="fill-slate-800 dark:fill-slate-200"
                  fontSize="10"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {lang === 'ru' ? 'КОРИДОР' : 'HALLWAY'}
                </text>

                {/* Live backend custom shapes */}
                {publicSnapshot?.document.shapes.map((shape) => {
                  const pts = shape.points
                    .map((p) => `${Math.round(p.x * scaleX)},${Math.round(p.y * scaleY)}`)
                    .join(' ');
                  return shape.kind === 'wall' ? (
                    <polyline key={shape.id} points={pts} fill="none" stroke="#94a3b8" strokeWidth="3" />
                  ) : (
                    <polygon
                      key={shape.id}
                      points={pts}
                      fill="rgba(227, 27, 35, 0.04)"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                    />
                  );
                })}

                {/* Active Route Path */}
                {routeActive &&
                  (polylinePoints ? (
                    <g>
                      <polyline
                        points={polylinePoints}
                        stroke="#E31B23"
                        strokeWidth="3.5"
                        strokeDasharray="6 6"
                        fill="none"
                        className="animate-route"
                      />
                      {routeResponse && routeResponse.polyline.length >= 2 && (
                        <>
                          <circle
                            cx={Math.round(routeResponse.polyline[0].x * scaleX)}
                            cy={Math.round(routeResponse.polyline[0].y * scaleY)}
                            r="5.5"
                            fill="#E31B23"
                          />
                          <circle
                            cx={Math.round(
                              routeResponse.polyline[routeResponse.polyline.length - 1].x * scaleX,
                            )}
                            cy={Math.round(
                              routeResponse.polyline[routeResponse.polyline.length - 1].y * scaleY,
                            )}
                            r="5.5"
                            fill="#E31B23"
                          />
                        </>
                      )}
                    </g>
                  ) : (
                    <g>
                      <path
                        d="M 200,320 L 280,320 L 280,150 L 480,150 M 480,150 L 480,260 L 580,260"
                        stroke="#E31B23"
                        strokeWidth="3.5"
                        strokeDasharray="6 6"
                        fill="none"
                        className="animate-route"
                      />
                      <circle cx="200" cy="320" r="5.5" fill="#E31B23" />
                      <circle cx="580" cy="260" r="5.5" fill="#E31B23" />
                    </g>
                  ))}

                {/* Interactive POI Badges on SVG */}
                {poisToRender.map((poi, idx) => {
                  const isSel = activePoi?.id === poi.id;
                  const cx = Math.round(poi.x * 6.8);
                  const cy = Math.round(poi.y * 3.4);
                  const badgeNum = poi.legacyId ?? 101 + idx;
                  return (
                    <g
                      key={poi.id}
                      className="cursor-pointer"
                      onClick={() => onSelectPoi(poi)}
                      transform={`translate(${cx},${cy})`}
                    >
                      {isSel && (
                        <circle
                          cx="0"
                          cy="0"
                          r="18"
                          fill="rgba(227, 27, 35, 0.22)"
                        />
                      )}
                      <circle
                        cx="0"
                        cy="0"
                        r="13"
                        className={
                          isSel
                            ? 'fill-brand-600 stroke-white dark:stroke-slate-900'
                            : 'fill-slate-900 dark:fill-white stroke-brand-600'
                        }
                        strokeWidth="2"
                      />
                      <text
                        x="0"
                        y="3.5"
                        className={isSel ? 'fill-white' : 'fill-white dark:fill-slate-900'}
                        fontSize="9"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {badgeNum}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
