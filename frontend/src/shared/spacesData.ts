import type { Poi, PublicMap } from '../../../CONTRACTS/types';

export type Lang = 'ru' | 'en';

export const i18n = {
  ru: {
    navSpaces: 'Пространства',
    navMap: 'Карта и навигация',
    navCabinet: 'Кабинет',
    navAdmin: 'Админ-панель',
    navLogin: 'Войти',
    heroTitle: 'Карта пространства и панорамы 360°',
    heroDesc:
      'Современный сервис для навигации внутри зданий с поддержкой офлайн-режима, поиска по фото и ИИ-генерации планов.',
    openMapBtn: 'Открыть карту ТТК Плаза',
    searchPhotoBtn: 'Найти объект по фото',
    spacesTitle: 'Доступные пространства и объекты',
    spacesSub: 'Выберите объект для детального осмотра панорам и построения маршрута',
    buildingLabel: 'Корпус:',
    floorLabel: 'Этаж',
    routeTitle: 'Маршрут',
    routeFrom: 'Откуда (Моё местоположение)',
    routeTo: 'Куда (Выберите пункт назначения)',
    buildRouteBtn: 'Построить маршрут',
    resetBtn: 'Сбросить',
    panoBtn: '360° Панорама',
    capacity: 'Вместимость',
    equipment: 'Оборудование',
    wifi: 'Wi-Fi покрытие',
    statusFree: 'Свободно',
    statusBusy: 'Занято',
    routeHere: 'Маршрут сюда',
    analyticsTitle: 'Аналитика посещаемости и пространств',
    analyticsSub: 'Статистика просмотров карты, популярных маршрутов и плотности потока',
    editorTitle: 'Редактор точек, съемка и ИИ-планы',
    authTitle: 'Вход / Регистрация в ТТК',
    registerTab: 'Регистрация',
    loginTab: 'Авторизация',
    registerBtn: 'Зарегистрироваться',
    loginBtn: 'Войти в систему',
  },
  en: {
    navSpaces: 'Spaces',
    navMap: 'Map & Navigation',
    navCabinet: 'Dashboard',
    navAdmin: 'Admin Panel',
    navLogin: 'Sign In',
    heroTitle: 'Space Map & 360° Panoramas',
    heroDesc:
      'Modern indoor navigation service with offline mode support, photo search, and AI blueprint generation.',
    openMapBtn: 'Open TTK Plaza Map',
    searchPhotoBtn: 'Search by Photo',
    spacesTitle: 'Available Spaces & Venues',
    spacesSub: 'Select a space to view panoramas and build custom routes',
    buildingLabel: 'Building:',
    floorLabel: 'Floor',
    routeTitle: 'Route Builder',
    routeFrom: 'From (My current location)',
    routeTo: 'To (Select destination)',
    buildRouteBtn: 'Build Route',
    resetBtn: 'Reset',
    panoBtn: '360° Panorama',
    capacity: 'Capacity',
    equipment: 'Equipment',
    wifi: 'Wi-Fi Coverage',
    statusFree: 'Available',
    statusBusy: 'Occupied',
    routeHere: 'Route Here',
    analyticsTitle: 'Attendance & Space Analytics',
    analyticsSub: 'Map view stats, popular routes, and peak traffic density',
    editorTitle: 'Point Editor, Capture & AI Blueprints',
    authTitle: 'Sign In / Register to TTK',
    registerTab: 'Register',
    loginTab: 'Sign In',
    registerBtn: 'Create Account',
    loginBtn: 'Log In',
  },
} as const;

export interface RichPoiItem {
  id: string;
  legacyId?: number;
  building: string;
  name: string;
  floor: number;
  category: Poi['category'];
  categoryName: string;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  planX: number; // plan units 0..700
  planY: number; // plan units 0..500
  navNodeId: string | null;
  status: string;
  capacity: string;
  equipment: string;
  wifi: string;
  description: string;
  image: string;
  icon: string;
}

export interface SpaceDefinition {
  id: string;
  mapId: string;
  slug: string;
  name: string;
  type: string;
  price: string;
  desc: string;
  image: string;
  buildings: Record<string, { name: string; floors: number[] }>;
  pois: RichPoiItem[];
}

export const SPACE_SLUGS: Record<string, string> = {
  plaza: 'ttkplazabusinesscenteraaaa',
  expo: 'ttkexpocitypavilionmapaaaa',
  hotel: 'ttkgrandcityhotelspaceaaaa',
};

export const SPACE_KEY_TO_SLUG = SPACE_SLUGS;

export const SLUG_TO_SPACE_KEY: Record<string, string> = {
  ttkplazabusinesscenteraaaa: 'plaza',
  ttkexpocitypavilionmapaaaa: 'expo',
  ttkgrandcityhotelspaceaaaa: 'hotel',
  demo: 'plaza',
};

export const initialSpacesData: Record<string, SpaceDefinition> = {
  plaza: {
    id: 'plaza',
    mapId: '00000000-0000-4000-8000-000000000101',
    slug: 'ttkplazabusinesscenteraaaa',
    name: 'Бизнес-центр «ТТК Плаза»',
    type: 'Бизнес-центр класса А',
    price: 'от 1 200 ₽ / час',
    desc: 'Главный офис ТрансТелеком. Переговорные комнаты, серверные, кофе-пойнты и зоны отдыха.',
    image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
    buildings: {
      A: { name: 'Корпус А (Главный)', floors: [1, 2, 3] },
      B: { name: 'Корпус B (Конгресс-холл)', floors: [1, 2] },
    },
    pois: [
      {
        id: '00000000-0000-4000-8000-000000004001',
        legacyId: 1,
        building: 'A',
        name: 'Central Lobby & Reception',
        floor: 1,
        category: 'entrance',
        categoryName: 'Вход / Ресепшн',
        x: 25,
        y: 30,
        planX: 175,
        planY: 150,
        navNodeId: '00000000-0000-4000-8000-000000002001',
        status: 'Свободно',
        capacity: '50 человек',
        equipment: 'Стойка информации, Турникеты, Инфо-терминал',
        wifi: 'TTK_Guest_5G (до 500 Мбит/с)',
        description:
          'Корпус A, Этаж 1 | Свободно | 50 человек | Стойка информации, Турникеты, Инфо-терминал | TTK_Guest_5G (до 500 Мбит/с)',
        image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
        icon: 'door-open',
      },
      {
        id: '00000000-0000-4000-8000-000000004002',
        legacyId: 2,
        building: 'A',
        name: 'Переговорная Альфа',
        floor: 3,
        category: 'hall',
        categoryName: 'Переговорная',
        x: 55,
        y: 30,
        planX: 385,
        planY: 150,
        navNodeId: '00000000-0000-4000-8000-000000002002',
        status: 'Свободно',
        capacity: '10 человек',
        equipment: 'Проектор 4K, маркерная доска, ВКС Cisco',
        wifi: 'TTK_VIP_Conference',
        description:
          'Корпус A, Этаж 3 | Свободно | 10 человек | Проектор 4K, маркерная доска, ВКС Cisco | TTK_VIP_Conference',
        image: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
        icon: 'users',
      },
      {
        id: '00000000-0000-4000-8000-000000004003',
        legacyId: 3,
        building: 'B',
        name: 'Главный Конференц-Зал',
        floor: 2,
        category: 'hall',
        categoryName: 'Зал мероприятий',
        x: 40,
        y: 70,
        planX: 280,
        planY: 350,
        navNodeId: '00000000-0000-4000-8000-000000002003',
        status: 'Занято',
        capacity: '120 человек',
        equipment: 'Сцена, LED-экран 8x4m, Радиомикрофоны',
        wifi: 'TTK_Event_Free',
        description:
          'Корпус B, Этаж 2 | Занято | 120 человек | Сцена, LED-экран 8x4m, Радиомикрофоны | TTK_Event_Free',
        image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80',
        icon: 'presentation',
      },
      {
        id: '00000000-0000-4000-8000-000000004004',
        legacyId: 4,
        building: 'A',
        name: 'Зона высокоскоростного Wi-Fi ТТК',
        floor: 2,
        category: 'wifi',
        categoryName: 'Точка Wi-Fi',
        x: 77,
        y: 30,
        planX: 540,
        planY: 150,
        navNodeId: '00000000-0000-4000-8000-000000002004',
        status: 'Свободно',
        capacity: '30 человек',
        equipment: 'Коворкинг, розетки 220V, принтер',
        wifi: 'TTK_Ultra_WiFi6',
        description: 'Корпус A, Этаж 2 | Свободно | 30 человек | Коворкинг, розетки 220V, принтер | TTK_Ultra_WiFi6',
        image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
        icon: 'wifi',
      },
    ],
  },
  expo: {
    id: 'expo',
    mapId: '00000000-0000-4000-8000-000000000102',
    slug: 'ttkexpocitypavilionmapaaaa',
    name: 'Выставочный комплекс «Экспо-Сити»',
    type: 'Выставочный павильон',
    price: 'от 3 500 ₽ / кв.м',
    desc: 'Инновационный форум связи и телекоммуникаций. Стенды партнёров и зоны нетворкинга.',
    image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
    buildings: {
      A: { name: 'Павильон №1', floors: [1, 2] },
    },
    pois: [
      {
        id: '00000000-0000-4000-8000-000000014001',
        legacyId: 101,
        building: 'A',
        name: 'Главный вход павильона А',
        floor: 1,
        category: 'entrance',
        categoryName: 'Вход',
        x: 30,
        y: 40,
        planX: 210,
        planY: 200,
        navNodeId: '00000000-0000-4000-8000-000000012001',
        status: 'Свободно',
        capacity: '200+ человек',
        equipment: 'Рамки металлодетекторов, Регистрация QR',
        wifi: 'Expo_Public_WiFi',
        description:
          'Корпус A, Этаж 1 | Свободно | 200+ человек | Рамки металлодетекторов, Регистрация QR | Expo_Public_WiFi',
        image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
        icon: 'door-open',
      },
      {
        id: '00000000-0000-4000-8000-000000014002',
        legacyId: 102,
        building: 'A',
        name: 'Стенд ТТК Digital & B2B',
        floor: 1,
        category: 'booth',
        categoryName: 'Стенд',
        x: 70,
        y: 40,
        planX: 490,
        planY: 200,
        navNodeId: '00000000-0000-4000-8000-000000012002',
        status: 'Свободно',
        capacity: '80 человек',
        equipment: 'Демо-терминалы, VR-зона, переговорные капсулы',
        wifi: 'TTK_Expo_5G',
        description:
          'Корпус A, Этаж 1 | Свободно | 80 человек | Демо-терминалы, VR-зона, переговорные капсулы | TTK_Expo_5G',
        image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
        icon: 'presentation',
      },
    ],
  },
  hotel: {
    id: 'hotel',
    mapId: '00000000-0000-4000-8000-000000000103',
    slug: 'ttkgrandcityhotelspaceaaaa',
    name: 'Отель «Гранд Сити»',
    type: 'Конференц-отель 5★',
    price: 'от 8 500 ₽ / сутки',
    desc: 'Конференц-отель с панорамными номерами, спа-комплексом и ресторанами высокой кухни.',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
    buildings: {
      A: { name: 'Главный Корпус', floors: [1, 2, 3, 4, 5] },
    },
    pois: [
      {
        id: '00000000-0000-4000-8000-000000024001',
        legacyId: 201,
        building: 'A',
        name: 'Ресепшн и Лобби',
        floor: 1,
        category: 'entrance',
        categoryName: 'Ресепшн',
        x: 50,
        y: 50,
        planX: 350,
        planY: 250,
        navNodeId: '00000000-0000-4000-8000-000000022001',
        status: 'Свободно',
        capacity: '40 человек',
        equipment: 'Стойка регистрации, консьерж',
        wifi: 'GrandCity_Guest',
        description: 'Корпус A, Этаж 1 | Свободно | 40 человек | Стойка регистрации, консьерж | GrandCity_Guest',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
        icon: 'home',
      },
      {
        id: '00000000-0000-4000-8000-000000024002',
        legacyId: 202,
        building: 'A',
        name: 'Банкетный зал «Империал»',
        floor: 2,
        category: 'hall',
        categoryName: 'Банкетный зал',
        x: 74,
        y: 68,
        planX: 520,
        planY: 340,
        navNodeId: '00000000-0000-4000-8000-000000022002',
        status: 'Свободно',
        capacity: '150 человек',
        equipment: 'Акустическая система, проекторы, подиум',
        wifi: 'GrandCity_VIP_5G',
        description:
          'Корпус A, Этаж 2 | Свободно | 150 человек | Акустическая система, проекторы, подиум | GrandCity_VIP_5G',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
        icon: 'users',
      },
    ],
  },
};

export function categoryDisplayName(category: Poi['category'], customLabel: string | null): string {
  switch (category) {
    case 'entrance':
      return 'Вход / Ресепшн';
    case 'hall':
      return 'Зал / Переговорная';
    case 'booth':
      return 'Стенд';
    case 'service_desk':
      return 'Стойка обслуживания';
    case 'wifi':
      return 'Точка Wi-Fi';
    case 'custom':
      return customLabel || 'Пользовательская точка';
  }
}

export function categoryIconName(category: Poi['category']): string {
  switch (category) {
    case 'entrance':
      return 'door-open';
    case 'hall':
      return 'users';
    case 'booth':
      return 'presentation';
    case 'service_desk':
      return 'home';
    case 'wifi':
      return 'wifi';
    case 'custom':
      return 'map-pin';
  }
}

export function enrichPoiFromContract(
  poi: Poi,
  widthUnits: number,
  heightUnits: number,
  fallbackSpace: SpaceDefinition,
): RichPoiItem {
  const existing = fallbackSpace.pois.find((item) => item.id === poi.id || item.name === poi.title);
  const parts = poi.description.split('|').map((s) => s.trim());

  let building = existing?.building ?? 'A';
  let floor = existing?.floor ?? 1;
  if (parts[0]) {
    const bMatch = parts[0].match(/Корпус\s+([A-Za-zА-Яа-я0-9]+)/i);
    const fMatch = parts[0].match(/Этаж\s+(\d+)/i);
    if (bMatch) building = bMatch[1];
    if (fMatch) floor = Number(fMatch[1]);
  }

  return {
    id: poi.id,
    legacyId: existing?.legacyId,
    building,
    name: poi.title,
    floor,
    category: poi.category,
    categoryName: poi.category_label ?? existing?.categoryName ?? categoryDisplayName(poi.category, poi.category_label),
    x: Math.min(96, Math.max(4, Math.round((poi.x / Math.max(1, widthUnits)) * 100))),
    y: Math.min(96, Math.max(4, Math.round((poi.y / Math.max(1, heightUnits)) * 100))),
    planX: poi.x,
    planY: poi.y,
    navNodeId: poi.nav_node_id,
    status: parts[1] || existing?.status || 'Свободно',
    capacity: parts[2] || existing?.capacity || '25 человек',
    equipment: parts[3] || existing?.equipment || poi.description || 'Стандартное оснащение ТТК',
    wifi: parts[4] || existing?.wifi || 'TTK_Free_WiFi',
    description: poi.description,
    image: existing?.image || fallbackSpace.image,
    icon: existing?.icon || categoryIconName(poi.category),
  };
}

export function mergePublicMapIntoSpace(snapshot: PublicMap, fallbackSpace: SpaceDefinition): SpaceDefinition {
  const enrichedPois = snapshot.document.pois.map((poi) =>
    enrichPoiFromContract(poi, snapshot.width_units, snapshot.height_units, fallbackSpace),
  );
  return {
    ...fallbackSpace,
    mapId: snapshot.id,
    slug: snapshot.slug,
    name: snapshot.document.title || fallbackSpace.name,
    desc: snapshot.document.description || fallbackSpace.desc,
    pois: enrichedPois.length > 0 ? enrichedPois : fallbackSpace.pois,
  };
}
