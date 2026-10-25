import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Navigation2,
  Route,
  Clock,
  Eye,
  Rotate3d,
  MapPin,
  Bookmark,
  Users,
  Monitor,
  Activity,
  Wifi,
  Navigation,
  QrCode,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
} from '../icons';
import {
  CategoryFilter,
  Language,
  PoiItem,
  SpaceItem,
  SpaceKey,
  TranslationDictionary,
  ViewType,
} from '../types';
import type { PublicMap, Shape } from '../../../../CONTRACTS/types';
import { buildVisitorModel, type VisitorPoi } from '../../features/visitor/model';
import { IsometricViewer } from '../../features/model3d/IsometricViewer';

interface MapViewProps {
  t: TranslationDictionary;
  lang: Language;
  currentSpace: SpaceItem;
  setCurrentView: (view: ViewType) => void;
  activeBuilding: string;
  activeFloor: number;
  setActiveFloor: (floor: number) => void;
  selectedCategory: CategoryFilter;
  setSelectedCategory: (cat: CategoryFilter) => void;
  routeActive: boolean;
  clearRoute: () => void;
  routeFrom: string;
  setRouteFrom: (val: string) => void;
  routeTo: string;
  setRouteTo: (val: string) => void;
  buildRoute: () => void;
  selectedPoi: PoiItem | null;
  setSelectedPoi: (poi: PoiItem) => void;
  openPanorama: (poi?: PoiItem | null) => void;
  toggleFavorite: (id: SpaceKey | number, e?: React.MouseEvent) => void;
  showNotification: (msg: string) => void;
  zoomLevel: number;
  zoomInMap: () => void;
  zoomOutMap: () => void;
  resetMapZoom: () => void;
  publicMap?: PublicMap | null;
}

export const MapView: React.FC<MapViewProps> = ({
  t,
  lang,
  currentSpace,
  setCurrentView,
  activeBuilding,
  activeFloor,
  setActiveFloor,
  selectedCategory,
  setSelectedCategory,
  routeActive,
  clearRoute,
  routeFrom,
  setRouteFrom,
  routeTo,
  setRouteTo,
  buildRoute,
  selectedPoi,
  setSelectedPoi,
  openPanorama,
  toggleFavorite,
  showNotification,
  zoomLevel,
  zoomInMap,
  zoomOutMap,
  resetMapZoom,
  publicMap = null,
}) => {
  const floors = currentSpace.buildings[activeBuilding]
    ? currentSpace.buildings[activeBuilding].floors
    : [1];

  const [mainDoorSide, setMainDoorSide] = useState<'south' | 'west' | 'east' | 'north'>('south');

  const getPolishedRoute = (
    fromInput: string,
    toInput: string,
    doorSide: 'south' | 'west' | 'east' | 'north'
  ) => {
    const normalize = (key: string) => {
      if (!key || key === 'entrance' || key === '1' || key === '101') return 'entrance';
      if (key === 'living' || key === '2' || key === '102') return 'living';
      if (key === 'kitchen') return 'kitchen';
      if (key === 'office_1') return 'office_1';
      if (key === 'office_2') return 'office_2';
      if (key === 'bathroom') return 'bathroom';
      return key;
    };

    const fromKey = normalize(fromInput);
    const toKey = normalize(toInput);

    const doorPosText = {
      south: lang === 'ru' ? 'южной главной двери (коридор)' : 'south main door (hallway)',
      west: lang === 'ru' ? 'западного входа (через Кабинет 1)' : 'west entrance (via Office 1)',
      east: lang === 'ru' ? 'восточного входа (через Кабинет 2)' : 'east entrance (via Office 2)',
      north: lang === 'ru' ? 'северного входа (со стороны холла)' : 'north entrance (via main hall)',
    }[doorSide];

    const doorPoint = {
      south: { x: 260, y: 362 },
      west: { x: 60, y: 180 },
      east: { x: 660, y: 310 },
      north: { x: 330, y: 60 },
    }[doorSide];

    let pts: Array<{ x: number; y: number }> = [];
    let length = '75 метров';
    let time = '~1 мин';
    let step1Title = lang === 'ru' ? `Пройдите от ${doorPosText}` : `Walk from the ${doorPosText}`;
    let step1Desc = lang === 'ru' ? 'Следуйте по выделенной навигационной линии' : 'Follow the highlighted navigation line';
    let step2Title = lang === 'ru' ? 'Двигайтесь по коридору через дверной проем' : 'Move along the corridor through the doorway';
    let step2Desc = lang === 'ru' ? 'Обратите внимание на цветовую разметку помещений' : 'Watch the color-coded room signage';
    let step3Title = lang === 'ru' ? 'Вы прибыли в пункт назначения' : 'Destination reached';
    let step3Desc = lang === 'ru' ? 'Вход в выбранное помещение' : 'Entrance to selected room';

    if (fromKey === 'entrance' || toKey === 'entrance') {
      const targetRoom = fromKey === 'entrance' ? toKey : fromKey;

      if (targetRoom === 'living') {
        length = doorSide === 'north' ? '25 метров' : doorSide === 'south' ? '65 метров' : '95 метров';
        time = '~1 мин';
        step2Title = lang === 'ru' ? 'Поверните в центральный холл' : 'Turn into the central hall';
        step2Desc = lang === 'ru' ? 'Оранжевая зона: открытый проем ведет в Переговорную Альфа' : 'Orange zone: open archway to Alfa Meeting Room';
        step3Title = lang === 'ru' ? 'Вы на месте: Переговорная Альфа' : 'Destination: Alfa Meeting Room';
        step3Desc = lang === 'ru' ? 'Центр зала переговоров' : 'Center of the meeting room';

        if (doorSide === 'south') {
          pts = [{ x: 260, y: 362 }, { x: 330, y: 362 }, { x: 330, y: 180 }];
        } else if (doorSide === 'west') {
          pts = [{ x: 60, y: 180 }, { x: 140, y: 180 }, { x: 240, y: 158 }, { x: 330, y: 158 }, { x: 330, y: 180 }];
        } else if (doorSide === 'east') {
          pts = [{ x: 660, y: 310 }, { x: 585, y: 310 }, { x: 500, y: 318 }, { x: 470, y: 362 }, { x: 330, y: 362 }, { x: 330, y: 180 }];
        } else {
          pts = [{ x: 330, y: 60 }, { x: 330, y: 180 }];
        }
      } else if (targetRoom === 'office_1') {
        length = doorSide === 'west' ? '20 метров' : '90 метров';
        time = doorSide === 'west' ? '~30 сек' : '~1.2 мин';
        step2Title = lang === 'ru' ? 'Пройдите через синий дверной проем' : 'Pass through the blue doorway';
        step2Desc = lang === 'ru' ? 'Синяя зона: рабочая зона и Кабинет 1' : 'Blue zone: work area and Office 1';
        step3Title = lang === 'ru' ? 'Вы на месте: Кабинет 1' : 'Destination: Office 1';
        step3Desc = lang === 'ru' ? 'Рабочее пространство' : 'Working space';

        if (doorSide === 'south') {
          pts = [{ x: 260, y: 362 }, { x: 330, y: 362 }, { x: 330, y: 158 }, { x: 240, y: 158 }, { x: 140, y: 180 }];
        } else if (doorSide === 'west') {
          pts = [{ x: 60, y: 180 }, { x: 140, y: 180 }];
        } else if (doorSide === 'east') {
          pts = [{ x: 660, y: 310 }, { x: 585, y: 310 }, { x: 500, y: 318 }, { x: 470, y: 362 }, { x: 330, y: 362 }, { x: 330, y: 158 }, { x: 240, y: 158 }, { x: 140, y: 180 }];
        } else {
          pts = [{ x: 330, y: 60 }, { x: 330, y: 158 }, { x: 240, y: 158 }, { x: 140, y: 180 }];
        }
      } else if (targetRoom === 'office_2') {
        length = doorSide === 'east' ? '20 метров' : '110 метров';
        time = doorSide === 'east' ? '~30 сек' : '~1.5 мин';
        step2Title = lang === 'ru' ? 'Пройдите через малиновый дверной проем' : 'Pass through pink doorway';
        step2Desc = lang === 'ru' ? 'Малиновая зона: Кабинет 2 и зона отдыха' : 'Pink zone: Office 2 and lounge';
        step3Title = lang === 'ru' ? 'Вы на месте: Кабинет 2' : 'Destination: Office 2';
        step3Desc = lang === 'ru' ? 'Зона отдыха и кабинет 2' : 'Lounge and office 2';

        if (doorSide === 'south') {
          pts = [{ x: 260, y: 362 }, { x: 470, y: 362 }, { x: 500, y: 318 }, { x: 585, y: 310 }];
        } else if (doorSide === 'west') {
          pts = [{ x: 60, y: 180 }, { x: 140, y: 180 }, { x: 240, y: 158 }, { x: 330, y: 158 }, { x: 330, y: 362 }, { x: 470, y: 362 }, { x: 500, y: 318 }, { x: 585, y: 310 }];
        } else if (doorSide === 'east') {
          pts = [{ x: 660, y: 310 }, { x: 585, y: 310 }];
        } else {
          pts = [{ x: 330, y: 60 }, { x: 330, y: 362 }, { x: 470, y: 362 }, { x: 500, y: 318 }, { x: 585, y: 310 }];
        }
      } else if (targetRoom === 'kitchen') {
        length = '85 метров';
        time = '~1.1 мин';
        step2Title = lang === 'ru' ? 'Поверните к изумрудному проему' : 'Turn to emerald entrance';
        step2Desc = lang === 'ru' ? 'Изумрудная зона: зона питания и кофе-пойнт' : 'Emerald zone: dining area and coffee point';
        step3Title = lang === 'ru' ? 'Вы на месте: Кофе-пойнт (Кухня)' : 'Destination: Coffee Point (Kitchen)';
        step3Desc = lang === 'ru' ? 'Зона кофе-брейка' : 'Coffee break zone';

        if (doorSide === 'south') {
          pts = [{ x: 260, y: 362 }, { x: 330, y: 362 }, { x: 330, y: 158 }, { x: 420, y: 158 }, { x: 490, y: 130 }];
        } else if (doorSide === 'west') {
          pts = [{ x: 60, y: 180 }, { x: 140, y: 180 }, { x: 240, y: 158 }, { x: 330, y: 158 }, { x: 420, y: 158 }, { x: 490, y: 130 }];
        } else if (doorSide === 'east') {
          pts = [{ x: 660, y: 310 }, { x: 585, y: 310 }, { x: 500, y: 318 }, { x: 470, y: 362 }, { x: 330, y: 362 }, { x: 330, y: 158 }, { x: 420, y: 158 }, { x: 490, y: 130 }];
        } else {
          pts = [{ x: 330, y: 60 }, { x: 330, y: 158 }, { x: 420, y: 158 }, { x: 490, y: 130 }];
        }
      } else {
        length = '100 метров';
        time = '~1.3 мин';
        step2Title = lang === 'ru' ? 'Пройдите через фиолетовый дверной проем' : 'Pass through purple doorway';
        step2Desc = lang === 'ru' ? 'Фиолетовая зона: санузел и сервисное помещение' : 'Purple zone: restroom and facilities';
        step3Title = lang === 'ru' ? 'Вы на месте: Санузел' : 'Destination: Restroom';
        step3Desc = lang === 'ru' ? 'Сервисная зона' : 'Facilities';

        pts = doorSide === 'south'
          ? [{ x: 260, y: 362 }, { x: 330, y: 362 }, { x: 330, y: 158 }, { x: 420, y: 158 }, { x: 560, y: 122 }, { x: 620, y: 95 }]
          : [{ x: doorPoint.x, y: doorPoint.y }, { x: 330, y: 158 }, { x: 420, y: 158 }, { x: 560, y: 122 }, { x: 620, y: 95 }];
      }

      if (fromKey !== 'entrance') {
        pts = [...pts].reverse();
      }
    } else {
      if ((fromKey === 'office_1' && toKey === 'living') || (fromKey === 'living' && toKey === 'office_1')) {
        pts = [{ x: 140, y: 180 }, { x: 240, y: 158 }, { x: 330, y: 158 }, { x: 330, y: 180 }];
        if (fromKey === 'living') pts.reverse();
        length = '45 метров';
        time = '~40 сек';
        step2Title = lang === 'ru' ? 'Пройдите через коридорный проем' : 'Walk through corridor doorway';
        step3Title = fromKey === 'office_1'
          ? (lang === 'ru' ? 'Вы на месте: Переговорная Альфа' : 'Destination: Alfa Meeting Room')
          : (lang === 'ru' ? 'Вы на месте: Кабинет 1' : 'Destination: Office 1');
      } else if ((fromKey === 'living' && toKey === 'office_2') || (fromKey === 'office_2' && toKey === 'living')) {
        pts = [{ x: 330, y: 180 }, { x: 330, y: 362 }, { x: 470, y: 362 }, { x: 500, y: 318 }, { x: 585, y: 310 }];
        if (fromKey === 'office_2') pts.reverse();
        length = '100 метров';
        time = '~1.4 мин';
        step2Title = lang === 'ru' ? 'Выйдите в коридор' : 'Exit to corridor';
        step3Title = fromKey === 'living'
          ? (lang === 'ru' ? 'Вы на месте: Кабинет 2' : 'Destination: Office 2')
          : (lang === 'ru' ? 'Вы на месте: Переговорная Альфа' : 'Destination: Alfa Meeting Room');
      } else {
        pts = [{ x: 140, y: 180 }, { x: 240, y: 158 }, { x: 330, y: 158 }, { x: 330, y: 362 }, { x: 470, y: 362 }, { x: 500, y: 318 }, { x: 585, y: 310 }];
        if (fromKey === 'office_2') pts.reverse();
        length = '125 метров';
        time = '~1.8 мин';
        step2Title = lang === 'ru' ? 'Пройдите через центральный коридор' : 'Walk across central corridor';
        step3Title = lang === 'ru' ? 'Вы прибыли в пункт назначения' : 'You have arrived';
      }
    }

    return {
      path: `M ${pts.map((p) => `${p.x},${p.y}`).join(' L ')}`,
      points: pts,
      start: pts[0],
      end: pts[pts.length - 1],
      length,
      time,
      steps: [
        { title: step1Title, desc: step1Desc },
        { title: step2Title, desc: step2Desc },
        { title: step3Title, desc: step3Desc },
      ],
    };
  };

  const activeRoute = getPolishedRoute(routeFrom, routeTo, mainDoorSide);
  const demoShapes = useMemo<Shape[]>(
    () => [
      { id: 'demo-room-1', kind: 'room', label: 'Кабинет 1', points: [{ x: 40, y: 40 }, { x: 240, y: 40 }, { x: 240, y: 320 }, { x: 40, y: 320 }] },
      { id: 'demo-room-2', kind: 'room', label: 'Переговорная Альфа', points: [{ x: 248, y: 40 }, { x: 420, y: 40 }, { x: 420, y: 320 }, { x: 248, y: 320 }] },
      { id: 'demo-room-3', kind: 'room', label: 'Кофе-пойнт', points: [{ x: 428, y: 40 }, { x: 552, y: 40 }, { x: 552, y: 220 }, { x: 428, y: 220 }] },
      { id: 'demo-room-4', kind: 'room', label: 'Санузел', points: [{ x: 560, y: 40 }, { x: 680, y: 40 }, { x: 680, y: 220 }, { x: 560, y: 220 }] },
      { id: 'demo-room-5', kind: 'room', label: 'Кабинет 2', points: [{ x: 500, y: 228 }, { x: 680, y: 228 }, { x: 680, y: 400 }, { x: 500, y: 400 }] },
      { id: 'demo-corridor', kind: 'corridor', label: 'Коридор', points: [{ x: 248, y: 328 }, { x: 500, y: 328 }, { x: 500, y: 400 }, { x: 248, y: 400 }] },
      { id: 'demo-wall-1', kind: 'wall', label: '', points: [{ x: 40, y: 40 }, { x: 680, y: 40 }, { x: 680, y: 400 }, { x: 240, y: 400 }, { x: 240, y: 320 }, { x: 40, y: 320 }] },
    ],
    [],
  );
  const backendVisitorModel = useMemo(() => (publicMap ? buildVisitorModel(publicMap) : null), [publicMap]);
  const isoPois = useMemo<VisitorPoi[]>(
    () => backendVisitorModel?.pois ?? currentSpace.pois.map((poi) => ({
      id: String(poi.id),
      title: poi.name[lang],
      category: poi.category === 'entrance' ? 'entrance' : poi.category === 'service' ? 'service_desk' : 'hall',
      categoryLabel: poi.categoryName[lang],
      description: poi.statusText[lang],
      x: poi.x * 6.8,
      y: poi.y * 3.8,
      navNodeId: null,
      panoramaId: null,
    })),
    [backendVisitorModel, currentSpace.pois, lang],
  );
  const isoShapes = backendVisitorModel?.shapes ?? demoShapes;
  const isoWidth = backendVisitorModel?.widthUnits ?? 720;
  const isoHeight = backendVisitorModel?.heightUnits ?? 440;

  return (
    <div className="map-view flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-[600px]">
      <div className="map-view__sidebar w-full md:w-96 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-20 shadow-md overflow-y-auto custom-scrollbar">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[9px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {lang === 'ru' ? 'Интерактивная карта' : 'Interactive Map'}
              </span>
              <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider">
                {currentSpace.type[lang]}
              </span>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                {currentSpace.name[lang]}
              </h2>
              <p className="text-xs font-bold text-slate-400 mt-0.5">
                {t.floorPlan}
              </p>
            </div>
            <button
              onClick={() => setCurrentView('spaces')}
              className="text-xs text-slate-500 hover:text-brand-600 flex items-center gap-1 font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.changeObject}</span>
            </button>
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {floors.map((floor) => (
              <button
                key={floor}
                onClick={() => setActiveFloor(floor)}
                className={`flex-1 py-1 rounded-lg text-xs transition text-center ${
                  activeFloor === floor
                    ? 'bg-white dark:bg-slate-700 text-brand-600 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {(lang === 'en' ? 'Floor ' : 'Этаж ') + floor}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-xl whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.filterAll}
            </button>
            <button
              onClick={() => setSelectedCategory('meeting')}
              className={`px-3 py-1 rounded-xl whitespace-nowrap ${
                selectedCategory === 'meeting'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.filterMeeting}
            </button>
            <button
              onClick={() => setSelectedCategory('entrance')}
              className={`px-3 py-1 rounded-xl whitespace-nowrap ${
                selectedCategory === 'entrance'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.filterEntrance}
            </button>
            <button
              onClick={() => setSelectedCategory('service')}
              className={`px-3 py-1 rounded-xl whitespace-nowrap ${
                selectedCategory === 'service'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.filterService}
            </button>
          </div>
        </div>

        <div className="p-4 flex-1 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-3">
            <div className="h-40 relative overflow-hidden bg-slate-900">
              <img
                src={
                  selectedPoi
                    ? selectedPoi.image
                    : 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80'
                }
                alt={selectedPoi ? selectedPoi.name[lang] : 'POI'}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-white/10 dark:bg-transparent pointer-events-none" />

              <span className="absolute top-2.5 left-2.5 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow z-10">
                ДОСТУПНА 3D
              </span>

              <button
                onClick={() => openPanorama(selectedPoi)}
                className="absolute bottom-2.5 left-2.5 right-2.5 bg-black/75 backdrop-blur-md text-white text-xs py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg border border-white/25 hover:bg-black/90 transition z-10"
              >
                <Rotate3d className="w-3.5 h-3.5" />
                <span>{t.panoBtn}</span>
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {selectedPoi ? selectedPoi.name[lang] : 'Переговорная Альфа'}
                  </h3>
                  <p className="text-xs font-semibold text-brand-600 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>
                      {'Корпус ' +
                        (selectedPoi ? selectedPoi.building : 'А') +
                        ', Этаж ' +
                        (selectedPoi ? selectedPoi.floor : '3')}
                    </span>
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    if (selectedPoi) {
                      toggleFavorite(selectedPoi.id, e);
                    } else {
                      toggleFavorite(currentSpace.id, e);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 transition"
                >
                  <Bookmark className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs border-t border-b border-slate-100 dark:border-slate-800 py-3">
                <div className="grid grid-cols-2 items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{t.capacity}</span>:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white text-right">
                    {selectedPoi ? selectedPoi.capacity : '10 человек'}
                  </span>
                </div>
                <div className="grid grid-cols-2 items-start gap-2">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
                    <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{t.equipment}</span>:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white text-right leading-snug">
                    {selectedPoi
                      ? selectedPoi.equipment
                      : 'Стойка информации, Турникеты'}
                  </span>
                </div>
                <div className="grid grid-cols-2 items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{t.statusTextTitle}</span>:
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>
                      {selectedPoi ? selectedPoi.statusText[lang] : 'Свободно'}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-2 items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{t.wifi}</span>:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white text-right">
                    {selectedPoi ? selectedPoi.wifi : 'TTK_Corporate (5G)'}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => openPanorama(selectedPoi)}
                  className="w-full btn-ttk bg-[#E31B23] hover:bg-[#FF4900] text-white font-bold py-2.5 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-2"
                >
                  <Rotate3d className="w-4 h-4" />
                  <span>{t.panoBtn}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Интерактивная векторная SVG карта */}
      <div className="map-view__content flex-1 bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-4">
        <div className="map-view__stage bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[520px] relative dark:shadow-[0_0_30px_rgba(249,115,22,0.12)]">
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between z-10">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                {currentSpace.name[lang]}
              </span>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">
                {'Корпус ' + activeBuilding + ' • Этаж ' + activeFloor}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={zoomInMap}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={zoomOutMap}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={resetMapZoom}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <IsometricViewer
            modelUrl={publicMap ? `/api/v1/public/maps/${encodeURIComponent(publicMap.slug)}/model3d.glb` : null}
            widthUnits={isoWidth}
            heightUnits={isoHeight}
            scaleMPerUnit={backendVisitorModel?.scaleMPerUnit}
            shapes={isoShapes}
            pois={isoPois}
            panoramas={backendVisitorModel?.panoramas ?? []}
            routePolyline={routeActive ? activeRoute.points : null}
            selectedPoiId={selectedPoi ? String(selectedPoi.id) : null}
            onSelectPoi={(poi) => {
              const found = currentSpace.pois.find((item) => String(item.id) === poi.id);
              if (found) setSelectedPoi(found);
            }}
            onOpenPanorama={() => openPanorama(selectedPoi)}
            onZoomIn={zoomInMap}
            onZoomOut={zoomOutMap}
            onResetZoom={resetMapZoom}
          />

          <div className="map-view__legacy-svg hidden map-view__svg-viewport flex-1 relative overflow-hidden flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
            <div
              className="map-view__svg-scroll relative transition-transform duration-300"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <svg
                className="map-view__svg w-[720px] h-[440px] bg-white dark:bg-slate-800/80 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-inner"
                viewBox="0 0 720 440"
              >
                <defs>
                  <pattern
                    id="grid"
                    width="20"
                    height="20"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 20 0 L 0 0 0 20"
                      fill="none"
                      stroke="#f1f5f9"
                      className="dark:stroke-slate-700/50"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="720" height="440" fill="url(#grid)" />

                {/* Крупные объекты / комнаты: каждому помещению свой выразительный цвет */}
                {/* Кабинет 1 (Синий) */}
                <rect
                  x="48"
                  y="48"
                  width="184"
                  height="264"
                  rx="14"
                  fill="rgba(59, 130, 246, 0.16)"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-90 transition"
                  onClick={() => {
                    setRouteTo('office_1');
                    showNotification(lang === 'ru' ? 'Выбран Кабинет 1' : 'Office 1 selected');
                  }}
                />
                {/* Переговорная Альфа (Оранжевый) */}
                <rect
                  x="248"
                  y="48"
                  width="164"
                  height="264"
                  rx="14"
                  fill="rgba(249, 115, 22, 0.16)"
                  stroke="#f97316"
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-90 transition"
                  onClick={() => {
                    setRouteTo('living');
                    showNotification(lang === 'ru' ? 'Выбрана Переговорная Альфа' : 'Alfa Meeting Room selected');
                  }}
                />
                {/* Кофе-пойнт / Кухня (Изумрудный) */}
                <rect
                  x="428"
                  y="48"
                  width="124"
                  height="164"
                  rx="14"
                  fill="rgba(16, 185, 129, 0.16)"
                  stroke="#10b981"
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-90 transition"
                  onClick={() => {
                    setRouteTo('kitchen');
                    showNotification(lang === 'ru' ? 'Выбран Кофе-пойнт' : 'Coffee Point selected');
                  }}
                />
                {/* Санузел / Ванная (Фиолетовый) */}
                <rect
                  x="568"
                  y="48"
                  width="104"
                  height="164"
                  rx="14"
                  fill="rgba(139, 92, 246, 0.16)"
                  stroke="#8b5cf6"
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-90 transition"
                  onClick={() => {
                    setRouteTo('bathroom');
                    showNotification(lang === 'ru' ? 'Выбран Санузел' : 'Restroom selected');
                  }}
                />
                {/* Кабинет 2 (Малиновый / Розовый) */}
                <rect
                  x="508"
                  y="228"
                  width="164"
                  height="164"
                  rx="14"
                  fill="rgba(236, 72, 153, 0.16)"
                  stroke="#ec4899"
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-90 transition"
                  onClick={() => {
                    setRouteTo('office_2');
                    showNotification(lang === 'ru' ? 'Выбран Кабинет 2' : 'Office 2 selected');
                  }}
                />
                {/* Центральный коридор (Сланцевый) */}
                <rect
                  x="248"
                  y="328"
                  width="244"
                  height="64"
                  rx="12"
                  fill="rgba(100, 116, 139, 0.14)"
                  stroke="#64748b"
                  strokeWidth="2"
                />

                {/* Основной контур стен здания (ровно соединенный с перегородкой 240) */}
                <path
                  d="M 40,40 L 680,40 L 680,400 L 240,400 L 240,320 L 40,320 Z"
                  fill="none"
                  stroke="#0f172a"
                  className="dark:stroke-slate-200"
                  strokeWidth="8"
                  strokeLinejoin="round"
                />

                {/* Внутренние перегородки и коридоры */}
                <line
                  x1="240"
                  y1="40"
                  x2="240"
                  y2="320"
                  stroke="#0f172a"
                  className="dark:stroke-slate-200"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <line
                  x1="420"
                  y1="40"
                  x2="420"
                  y2="220"
                  stroke="#0f172a"
                  className="dark:stroke-slate-200"
                  strokeWidth="5"
                />
                <line
                  x1="420"
                  y1="220"
                  x2="680"
                  y2="220"
                  stroke="#0f172a"
                  className="dark:stroke-slate-200"
                  strokeWidth="5"
                />
                <line
                  x1="560"
                  y1="40"
                  x2="560"
                  y2="140"
                  stroke="#0f172a"
                  className="dark:stroke-slate-200"
                  strokeWidth="4"
                />
                <line
                  x1="560"
                  y1="140"
                  x2="680"
                  y2="140"
                  stroke="#0f172a"
                  className="dark:stroke-slate-200"
                  strokeWidth="4"
                />
                <line
                  x1="500"
                  y1="220"
                  x2="500"
                  y2="400"
                  stroke="#0f172a"
                  className="dark:stroke-slate-200"
                  strokeWidth="5"
                />

                {/* Межкомнатные цветные двери в тон комнатам */}
                <rect
                  x="236"
                  y="140"
                  width="8"
                  height="36"
                  rx="3"
                  fill="#3b82f6"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                >
                  <title>Дверь: Кабинет 1</title>
                </rect>
                <rect
                  x="416"
                  y="140"
                  width="8"
                  height="36"
                  rx="3"
                  fill="#f97316"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                >
                  <title>Дверь: Переговорная Альфа</title>
                </rect>
                <rect
                  x="496"
                  y="216"
                  width="36"
                  height="8"
                  rx="3"
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                >
                  <title>Дверь: Кофе-пойнт</title>
                </rect>
                <rect
                  x="556"
                  y="104"
                  width="8"
                  height="36"
                  rx="3"
                  fill="#8b5cf6"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                >
                  <title>Дверь: Санузел</title>
                </rect>
                <rect
                  x="496"
                  y="290"
                  width="8"
                  height="36"
                  rx="3"
                  fill="#ec4899"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                >
                  <title>Дверь: Кабинет 2</title>
                </rect>

                {/* ГЛАВНАЯ ВХОДНАЯ ДВЕРЬ (положение выбирается владельцем) */}
                {mainDoorSide === 'south' && (
                  <g>
                    <rect
                      x="236"
                      y="342"
                      width="8"
                      height="36"
                      rx="3"
                      fill="#E31B23"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <g transform="translate(132, 348)">
                      <rect width="98" height="24" rx="6" fill="#E31B23" />
                      <text x="49" y="16" fill="#ffffff" fontSize="9" fontWeight="900" textAnchor="middle">
                        ГЛАВНАЯ ДВЕРЬ
                      </text>
                    </g>
                  </g>
                )}
                {mainDoorSide === 'west' && (
                  <g>
                    <rect
                      x="36"
                      y="162"
                      width="8"
                      height="36"
                      rx="3"
                      fill="#E31B23"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <g transform="translate(48, 168)">
                      <rect width="98" height="24" rx="6" fill="#E31B23" />
                      <text x="49" y="16" fill="#ffffff" fontSize="9" fontWeight="900" textAnchor="middle">
                        ГЛАВНАЯ ДВЕРЬ
                      </text>
                    </g>
                  </g>
                )}
                {mainDoorSide === 'east' && (
                  <g>
                    <rect
                      x="676"
                      y="292"
                      width="8"
                      height="36"
                      rx="3"
                      fill="#E31B23"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <g transform="translate(572, 298)">
                      <rect width="98" height="24" rx="6" fill="#E31B23" />
                      <text x="49" y="16" fill="#ffffff" fontSize="9" fontWeight="900" textAnchor="middle">
                        ГЛАВНАЯ ДВЕРЬ
                      </text>
                    </g>
                  </g>
                )}
                {mainDoorSide === 'north' && (
                  <g>
                    <rect
                      x="312"
                      y="36"
                      width="36"
                      height="8"
                      rx="3"
                      fill="#E31B23"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <g transform="translate(281, 48)">
                      <rect width="98" height="24" rx="6" fill="#E31B23" />
                      <text x="49" y="16" fill="#ffffff" fontSize="9" fontWeight="900" textAnchor="middle">
                        ГЛАВНАЯ ДВЕРЬ
                      </text>
                    </g>
                  </g>
                )}

                {/* Внешние входы / проемы */}
                <line x1="100" y1="40" x2="180" y2="40" stroke="#f97316" strokeWidth="5" />
                <line x1="280" y1="40" x2="380" y2="40" stroke="#f97316" strokeWidth="5" />
                <line x1="460" y1="40" x2="520" y2="40" stroke="#f97316" strokeWidth="5" />

                {/* Цветные плашки-наименования помещений */}
                {/* Кабинет 1 */}
                <g transform="translate(140, 165)">
                  <rect x="-48" y="-12" width="96" height="22" rx="6" fill="#3b82f6" />
                  <text x="0" y="4" fill="#ffffff" fontSize="10" fontWeight="900" textAnchor="middle">
                    КАБИНЕТ 1
                  </text>
                </g>
                {/* Переговорная Альфа */}
                <g transform="translate(330, 165)">
                  <rect x="-65" y="-12" width="130" height="22" rx="6" fill="#f97316" />
                  <text x="0" y="4" fill="#ffffff" fontSize="10" fontWeight="900" textAnchor="middle">
                    ПЕРЕГОВОРНАЯ АЛЬФА
                  </text>
                </g>
                {/* Кофе-пойнт */}
                <g transform="translate(490, 95)">
                  <rect x="-45" y="-11" width="90" height="20" rx="5" fill="#10b981" />
                  <text x="0" y="3" fill="#ffffff" fontSize="9" fontWeight="900" textAnchor="middle">
                    КОФЕ-ПОЙНТ
                  </text>
                </g>
                {/* Санузел */}
                <g transform="translate(620, 90)">
                  <rect x="-35" y="-10" width="70" height="18" rx="5" fill="#8b5cf6" />
                  <text x="0" y="3" fill="#ffffff" fontSize="8.5" fontWeight="900" textAnchor="middle">
                    САНУЗЕЛ
                  </text>
                </g>
                {/* Кабинет 2 */}
                <g transform="translate(590, 310)">
                  <rect x="-48" y="-12" width="96" height="22" rx="6" fill="#ec4899" />
                  <text x="0" y="4" fill="#ffffff" fontSize="10" fontWeight="900" textAnchor="middle">
                    КАБИНЕТ 2
                  </text>
                </g>
                {/* Коридор */}
                <g transform="translate(360, 360)">
                  <rect x="-40" y="-10" width="80" height="18" rx="5" fill="#64748b" />
                  <text x="0" y="3" fill="#ffffff" fontSize="8.5" fontWeight="900" textAnchor="middle">
                    КОРИДОР
                  </text>
                </g>

                {/* Анимированный реалистичный маршрут */}
                {routeActive && (
                  <g>
                    <path
                      d={activeRoute.path}
                      stroke="#E31B23"
                      strokeWidth="4"
                      strokeDasharray="6 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      className="animate-route"
                    />
                    {/* Точка А (Откуда) */}
                    <g transform={`translate(${activeRoute.start.x}, ${activeRoute.start.y})`}>
                      <circle cx="0" cy="0" r="9" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
                      <circle cx="0" cy="0" r="3.5" fill="#ffffff" />
                      <text x="0" y="-14" fill="#10b981" fontSize="11" fontWeight="900" textAnchor="middle">A</text>
                    </g>
                    {/* Точка В (Куда) */}
                    <g transform={`translate(${activeRoute.end.x}, ${activeRoute.end.y})`}>
                      <circle cx="0" cy="0" r="15" fill="#E31B23" opacity="0.3" className="animate-ping" />
                      <circle cx="0" cy="0" r="9" fill="#E31B23" stroke="#ffffff" strokeWidth="2.5" />
                      <circle cx="0" cy="0" r="3.5" fill="#ffffff" />
                      <text x="0" y="-14" fill="#E31B23" fontSize="11" fontWeight="900" textAnchor="middle">B</text>
                    </g>
                  </g>
                )}

                {/* Интерактивные точки интереса (POI) - БЕЗ 101/102, с чистыми маркерами */}
                {currentSpace.pois.map((poi) => (
                  <g
                    key={poi.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedPoi(poi);
                      setRouteTo(poi.category === 'entrance' ? 'entrance' : 'living');
                    }}
                    transform={`translate(${poi.x * 6.8},${poi.y * 3.8})`}
                  >
                    <circle
                      cx="0"
                      cy="0"
                      r="12"
                      className="fill-white dark:fill-slate-900 stroke-brand-600 shadow-md"
                      strokeWidth="2.5"
                    />
                    <circle cx="0" cy="0" r="4.5" fill="#E31B23" />
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>

        {/* БЛОК: ПОСТРОЕНИЕ И РАСЧЕТ МАРШРУТА С ПОШАГОВОЙ ИНСТРУКЦИЕЙ */}
        <div className="map-view__route bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 mt-4">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {t.routeCalcTitle}
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ЛЕВАЯ КОЛОНКА: Выбор точек, параметры и кнопка */}
            <div className="lg:col-span-4 space-y-5">
              {/* Положение главной двери здания */}
              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>{lang === 'ru' ? 'Главная дверь здания' : 'Main Entrance Door'}</span>
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-md">
                    {lang === 'ru' ? 'Старт навигации' : 'Navigation start'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                  {(['south', 'west', 'east', 'north'] as const).map((side) => {
                    const label = {
                      south: lang === 'ru' ? 'Южный вход' : 'South Entry',
                      west: lang === 'ru' ? 'Западный вход' : 'West Entry',
                      east: lang === 'ru' ? 'Восточный вход' : 'East Entry',
                      north: lang === 'ru' ? 'Северный вход' : 'North Entry',
                    }[side];
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => {
                          setMainDoorSide(side);
                          showNotification(lang === 'ru' ? `Главная дверь установлена (${label})` : `Main door placed at ${label}`);
                        }}
                        className={`py-1.5 px-1 rounded-xl font-bold transition text-center text-[11px] ${
                          mainDoorSide === side
                            ? 'bg-[#E31B23] text-white shadow-xs'
                            : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Точка отправления (А) */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {t.routeFromLabel}
                </label>
                <div className="relative">
                  <select
                    value={routeFrom}
                    onChange={(e) => setRouteFrom(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-brand-600 transition shadow-2xs"
                  >
                    <option value="entrance">{lang === 'ru' ? 'Главная входная дверь' : 'Main Entrance Door'}</option>
                    <option value="living">{lang === 'ru' ? 'Переговорная Альфа (Гостиная)' : 'Alfa Meeting Room (Living Room)'}</option>
                    <option value="office_1">{lang === 'ru' ? 'Кабинет 1 (Рабочая зона)' : 'Office 1 (Work Zone)'}</option>
                    <option value="office_2">{lang === 'ru' ? 'Кабинет 2 (Зона отдыха)' : 'Office 2 (Lounge Zone)'}</option>
                    <option value="kitchen">{lang === 'ru' ? 'Кофе-пойнт (Кухня)' : 'Coffee Point (Kitchen)'}</option>
                    <option value="bathroom">{lang === 'ru' ? 'Санузел (Сервисная зона)' : 'Restroom'}</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Точка назначения (В) */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {t.routeToLabel}
                </label>
                <div className="relative">
                  <select
                    value={routeTo}
                    onChange={(e) => setRouteTo(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-brand-600 transition shadow-2xs"
                  >
                    <option value="living">{lang === 'ru' ? 'Переговорная Альфа (Гостиная)' : 'Alfa Meeting Room (Living Room)'}</option>
                    <option value="office_1">{lang === 'ru' ? 'Кабинет 1 (Рабочая зона)' : 'Office 1 (Work Zone)'}</option>
                    <option value="office_2">{lang === 'ru' ? 'Кабинет 2 (Зона отдыха)' : 'Office 2 (Lounge Zone)'}</option>
                    <option value="kitchen">{lang === 'ru' ? 'Кофе-пойнт (Кухня)' : 'Coffee Point (Kitchen)'}</option>
                    <option value="bathroom">{lang === 'ru' ? 'Санузел (Сервисная зона)' : 'Restroom'}</option>
                    <option value="entrance">{lang === 'ru' ? 'Главная входная дверь' : 'Main Entrance Door'}</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Карточка "Параметры маршрута" */}
              <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 rounded-2xl p-4 space-y-2 text-xs sm:text-sm">
                <h4 className="font-bold text-brand-600 dark:text-brand-400">
                  {t.routeParamsTitle}
                </h4>
                <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 font-medium">
                  <li className="flex items-center gap-1.5">
                    <span className="text-slate-400">•</span>
                    <span>{lang === 'ru' ? `Длина пути: ${activeRoute.length}` : `Path length: ${activeRoute.length}`}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-slate-400">•</span>
                    <span>{lang === 'ru' ? `Время ходьбы: ${activeRoute.time}` : `Walking time: ${activeRoute.time}`}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-slate-400">•</span>
                    <span>{t.paramAccessible}</span>
                  </li>
                </ul>
              </div>

              {/* Кнопка действия */}
              <button
                onClick={buildRoute}
                className="w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-bold py-3.5 px-4 rounded-xl text-xs sm:text-sm transition shadow-md shadow-brand-600/20 flex items-center justify-center text-center"
              >
                <span>{t.showOnMapBtn}</span>
              </button>
            </div>

            {/* ПРАВАЯ КОЛОНКА: Пошаговая инструкция пути */}
            <div className="lg:col-span-8 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                {t.stepInstructionTitle}
              </h3>

              <div className="space-y-3">
                {activeRoute.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex items-start gap-4 shadow-2xs transition hover:shadow-xs"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-600 text-white font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm leading-snug">
                        {step.title}
                      </h4>
                      <p className="text-xs text-slate-400 font-normal">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
