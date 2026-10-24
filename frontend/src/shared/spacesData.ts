import type { Poi, PublicMap } from '../../../CONTRACTS/types';

export type Lang = 'ru' | 'en';

export const i18n = {
  ru: {
    navSpaces: 'Пространства',
    navMap: 'Карта и навигация',
    navCabinet: 'Кабинет',
    navAdmin: 'Админ-панель',
    navLogin: 'Войти',
    searchPlaceholder: 'Поиск объектов, залов, оборудования...',
    heroTitle: 'Карта пространства и панорамы 360°',
    heroDesc:
      'Современный высокоточный сервис для навигации внутри зданий, бизнес-центров класса А, отелей и выставочных комплексов с поддержкой офлайн-режима.',
    openMapBtn: 'Открыть карту ТТК Плаза',
    searchPhotoBtn: 'Найти объект по фото',
    spacesTitle: 'Доступные пространства и объекты',
    spacesSub: 'Выберите объект для детального осмотра панорам 360° и построения оптимального маршрута',
    buildingLabel: 'Корпус:',
    floorLabel: 'Этаж',
    routeTitle: 'Построение маршрута',
    routeFrom: 'Точка отправления (А)',
    routeTo: 'Точка назначения (В)',
    buildRouteBtn: 'Построить маршрут',
    resetBtn: 'Сбросить',
    panoBtn: '360° Панорама',
    capacity: 'Вместимость',
    equipment: 'Оборудование',
    wifi: 'Wi-Fi покрытие',
    statusFree: 'Свободно',
    statusBusy: 'Занято',
    statusBookable: 'Можно забронировать',
    routeHere: 'Маршрут сюда',
    analyticsTitle: 'Аналитика посещаемости и пространств',
    analyticsSub: 'Статистика просмотров интерактивной карты, популярных маршрутов и плотности потока',
    editorTitle: 'Редактор точек, съемка и ИИ-планы',
    authTitle: 'Вход / Регистрация в системе ТТК',
    adminAuthPromptTitle: 'Авторизация администратора ТТК',
    adminAuthPromptDesc: 'Для доступа к панели администратора введите защищенный пароль admin2026',
    adminPasswordLabel: 'Пароль администратора',
    adminLoginBtn: 'Войти в админ-панель',
    registerTab: 'Регистрация',
    loginTab: 'Авторизация',
    registerBtn: 'Зарегистрироваться',
    loginBtn: 'Войти в систему',
    offlineModeOn: 'Офлайн-режим',
    offlineModeOff: 'Онлайн',
    privacyApi: 'Конфиденциальность API',
    termsLink: 'Условия использования',
    footerCopy: '© 2026 ТТК (ТрансТелеком). Все права защищены.',
    adminLinkTitle: 'Перейти в админ-панель',
    changeObject: 'Сменить объект',
  },
  en: {
    navSpaces: 'Spaces',
    navMap: 'Map & Navigation',
    navCabinet: 'Dashboard',
    navAdmin: 'Admin Panel',
    navLogin: 'Sign In',
    searchPlaceholder: 'Search spaces, rooms, equipment...',
    heroTitle: 'Space Map & 360° Panoramas',
    heroDesc:
      'Modern high-precision indoor navigation service for buildings, Class A business centers, hotels, and exhibition complexes with offline mode support.',
    openMapBtn: 'Open TTK Plaza Map',
    searchPhotoBtn: 'Search by Photo',
    spacesTitle: 'Available Spaces & Venues',
    spacesSub: 'Select a space to view 360° panoramas and build optimal routes',
    buildingLabel: 'Building:',
    floorLabel: 'Floor',
    routeTitle: 'Route Builder',
    routeFrom: 'From (My Location)',
    routeTo: 'To (Destination)',
    buildRouteBtn: 'Build Route',
    resetBtn: 'Reset',
    panoBtn: '360° Panorama',
    capacity: 'Capacity',
    equipment: 'Equipment',
    wifi: 'Wi-Fi Coverage',
    statusFree: 'Available',
    statusBusy: 'Occupied',
    statusBookable: 'Bookable',
    routeHere: 'Route Here',
    analyticsTitle: 'Attendance & Space Analytics',
    analyticsSub: 'Interactive map view statistics, popular routes, and peak traffic density',
    editorTitle: 'Point Editor, Capture & AI Blueprints',
    authTitle: 'Sign In / Register to TTK System',
    adminAuthPromptTitle: 'TTK Administrator Authorization',
    adminAuthPromptDesc: 'Enter secure admin password admin2026 to access the administration panel',
    adminPasswordLabel: 'Admin Password',
    adminLoginBtn: 'Access Admin Panel',
    registerTab: 'Register',
    loginTab: 'Sign In',
    registerBtn: 'Create Account',
    loginBtn: 'Log In',
    offlineModeOn: 'Offline Mode',
    offlineModeOff: 'Online',
    privacyApi: 'API Privacy',
    termsLink: 'Terms of Use',
    footerCopy: '© 2026 TTK (TransTeleCom). All rights reserved.',
    adminLinkTitle: 'Go to Admin Panel',
    changeObject: 'Change Object',
  },
} as const;

export interface RichPoiItem {
  id: string;
  legacyId?: number;
  building: string;
  name: string;
  nameEn?: string;
  floor: number;
  category: Poi['category'];
  filterCategory?: 'meeting' | 'entrance' | 'service';
  categoryName: string;
  categoryNameEn?: string;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  planX: number; // plan units 0..700
  planY: number; // plan units 0..500
  navNodeId: string | null;
  status: string;
  statusEn?: string;
  statusKind?: 'free' | 'bookable' | 'busy';
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
  nameEn?: string;
  type: string;
  typeEn?: string;
  price: string;
  desc: string;
  descEn?: string;
  rating: number;
  reviewsCount: number;
  image: string;
  buildings: Record<string, { name: string; nameEn?: string; floors: number[] }>;
  pois: RichPoiItem[];
}

export const SPACE_SLUGS: Record<string, string> = {
  plaza: 'ttkplazabusinesscenteraaaa',
  expo: 'ttkexpocitypavilionmapaaaa',
  hotel: 'ttkgrandcityhotelspaceaaaa',
  hub: 'ttkinnovationithubspaceaaa',
};

export const SPACE_KEY_TO_SLUG = SPACE_SLUGS;

export const SLUG_TO_SPACE_KEY: Record<string, string> = {
  ttkplazabusinesscenteraaaa: 'plaza',
  ttkexpocitypavilionmapaaaa: 'expo',
  ttkgrandcityhotelspaceaaaa: 'hotel',
  ttkinnovationithubspaceaaa: 'hub',
  demo: 'plaza',
};

export const initialSpacesData: Record<string, SpaceDefinition> = {
  plaza: {
    id: 'plaza',
    mapId: '00000000-0000-4000-8000-000000000101',
    slug: 'ttkplazabusinesscenteraaaa',
    name: 'Бизнес-центр «ТТК Плаза»',
    nameEn: 'Business Center "TTK Plaza"',
    type: 'Бизнес-центр класса А',
    typeEn: 'Class A Business Center',
    price: 'от 1 200 ₽ / час',
    desc: 'Главный офис ТрансТелеком. Переговорные комнаты, серверные узлы, кофе-пойнты и комфортные зоны отдыха.',
    descEn: 'TransTeleCom Head Office. Meeting rooms, server rooms, coffee points and lounge areas.',
    rating: 4.9,
    reviewsCount: 128,
    image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
    buildings: {
      A: { name: 'Корпус А (Главный)', nameEn: 'Building A (Main)', floors: [1, 2, 3] },
      B: { name: 'Корпус B (Конгресс-холл)', nameEn: 'Building B (Congress Hall)', floors: [1, 2] },
    },
    pois: [
      {
        id: '00000000-0000-4000-8000-000000004001',
        legacyId: 101,
        building: 'A',
        name: 'Главный вход и Центральный ресепшн',
        nameEn: 'Main Entrance & Central Reception',
        floor: 1,
        category: 'entrance',
        filterCategory: 'entrance',
        categoryName: 'Вход / Ресепшн',
        categoryNameEn: 'Entrance / Reception',
        x: 25,
        y: 30,
        planX: 175,
        planY: 150,
        navNodeId: '00000000-0000-4000-8000-000000002001',
        status: 'Свободно',
        statusEn: 'Available',
        statusKind: 'free',
        capacity: '50 человек',
        equipment: 'Стойка информации, Турникеты, Инфо-терминал',
        wifi: 'TTK_Corporate (5G)',
        description:
          'Корпус A, Этаж 1 | Свободно | 50 человек | Стойка информации, Турникеты, Инфо-терминал | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
        icon: 'door-open',
      },
      {
        id: '00000000-0000-4000-8000-000000004002',
        legacyId: 102,
        building: 'A',
        name: 'Переговорная Альфа',
        nameEn: 'Alfa Meeting Room',
        floor: 3,
        category: 'hall',
        filterCategory: 'meeting',
        categoryName: 'Переговорная',
        categoryNameEn: 'Meeting Room',
        x: 55,
        y: 30,
        planX: 385,
        planY: 150,
        navNodeId: '00000000-0000-4000-8000-000000002002',
        status: 'Свободно',
        statusEn: 'Available',
        statusKind: 'bookable',
        capacity: '10 человек',
        equipment: 'Проектор, маркерная доска, ВКС система',
        wifi: 'TTK_Corporate (5G)',
        description:
          'Корпус A, Этаж 3 | Свободно | 10 человек | Проектор, маркерная доска, ВКС система | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
        icon: 'users',
      },
      {
        id: '00000000-0000-4000-8000-000000004003',
        legacyId: 103,
        building: 'A',
        name: 'Кофе-пойнт и Лаунж зона',
        nameEn: 'Coffee Point & Lounge',
        floor: 2,
        category: 'service_desk',
        filterCategory: 'service',
        categoryName: 'Зона отдыха',
        categoryNameEn: 'Lounge',
        x: 75,
        y: 70,
        planX: 525,
        planY: 350,
        navNodeId: '00000000-0000-4000-8000-000000002003',
        status: 'Открыто',
        statusEn: 'Open',
        statusKind: 'free',
        capacity: '25 человек',
        equipment: 'Кофемашины, Кулеры с водой, Мягкая мебель',
        wifi: 'TTK_Corporate (5G)',
        description:
          'Корпус A, Этаж 2 | Открыто | 25 человек | Кофемашины, Кулеры с водой, Мягкая мебель | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1200&q=80',
        icon: 'coffee',
      },
      {
        id: '00000000-0000-4000-8000-000000004004',
        legacyId: 104,
        building: 'B',
        name: 'Главный Конференц-Зал «ТТК»',
        nameEn: 'Main Conference Hall "TTK"',
        floor: 1,
        category: 'hall',
        filterCategory: 'meeting',
        categoryName: 'Зал мероприятий',
        categoryNameEn: 'Event Hall',
        x: 40,
        y: 70,
        planX: 280,
        planY: 350,
        navNodeId: '00000000-0000-4000-8000-000000002004',
        status: 'Занято',
        statusEn: 'Occupied',
        statusKind: 'busy',
        capacity: '120 человек',
        equipment: 'Сцена, LED-экран 8x4m, Радиомикрофоны',
        wifi: 'TTK_Corporate (5G)',
        description: 'Корпус B, Этаж 1 | Занято | 120 человек | Сцена, LED-экран 8x4m, Радиомикрофоны | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80',
        icon: 'presentation',
      },
    ],
  },
  expo: {
    id: 'expo',
    mapId: '00000000-0000-4000-8000-000000000102',
    slug: 'ttkexpocitypavilionmapaaaa',
    name: 'Выставочный комплекс «Экспо-Сити»',
    nameEn: 'Exhibition Complex "Expo-City"',
    type: 'Выставочный павильон',
    typeEn: 'Exhibition Pavilion',
    price: 'от 3 500 ₽ / кв.м',
    desc: 'Инновационный форум связи и телекоммуникаций. Стенды партнёров и интерактивные зоны нетворкинга.',
    descEn: 'Innovative telecom forum. Partner booths and interactive networking areas.',
    rating: 4.7,
    reviewsCount: 94,
    image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
    buildings: {
      A: { name: 'Павильон №1', nameEn: 'Pavilion No. 1', floors: [1, 2] },
      B: { name: 'Павильон №2', nameEn: 'Pavilion No. 2', floors: [1] },
    },
    pois: [
      {
        id: '00000000-0000-4000-8000-000000014001',
        legacyId: 201,
        building: 'A',
        name: 'Главный вход павильона А',
        nameEn: 'Main Entrance Pavilion A',
        floor: 1,
        category: 'entrance',
        filterCategory: 'entrance',
        categoryName: 'Вход',
        categoryNameEn: 'Entrance',
        x: 30,
        y: 40,
        planX: 210,
        planY: 200,
        navNodeId: '00000000-0000-4000-8000-000000012001',
        status: 'Свободно',
        statusEn: 'Available',
        statusKind: 'free',
        capacity: '200+ человек',
        equipment: 'Рамки металлодетекторов, Регистрация по QR',
        wifi: 'TTK_Corporate (5G)',
        description:
          'Корпус A, Этаж 1 | Свободно | 200+ человек | Рамки металлодетекторов, Регистрация по QR | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
        icon: 'door-open',
      },
      {
        id: '00000000-0000-4000-8000-000000014002',
        legacyId: 202,
        building: 'A',
        name: 'Интерактивный стенд ТТК «Связь Будущего»',
        nameEn: 'TTK Interactive Stand',
        floor: 1,
        category: 'booth',
        filterCategory: 'service',
        categoryName: 'Стенд',
        categoryNameEn: 'Exhibition Stand',
        x: 60,
        y: 50,
        planX: 420,
        planY: 250,
        navNodeId: '00000000-0000-4000-8000-000000012002',
        status: 'Работает',
        statusEn: 'Active',
        statusKind: 'free',
        capacity: '30 человек',
        equipment: 'VR-очки, сенсорные интерактивные столы, демо 5G',
        wifi: 'TTK_Corporate (5G)',
        description:
          'Корпус A, Этаж 1 | Работает | 30 человек | VR-очки, сенсорные интерактивные столы, демо 5G | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
        icon: 'sparkles',
      },
    ],
  },
  hotel: {
    id: 'hotel',
    mapId: '00000000-0000-4000-8000-000000000103',
    slug: 'ttkgrandcityhotelspaceaaaa',
    name: 'Отель «Гранд Сити»',
    nameEn: 'Grand City Hotel',
    type: 'Конференц-отель 5★',
    typeEn: 'Conference Hotel 5★',
    price: 'от 8 500 ₽ / сутки',
    desc: 'Конференц-отель с панорамными номерами, современным спа-комплексом и ресторанами высокой кухни.',
    descEn: 'Conference hotel with panoramic rooms, spa complex and fine dining.',
    rating: 4.9,
    reviewsCount: 215,
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
    buildings: {
      A: { name: 'Главный Корпус', nameEn: 'Main Building', floors: [1, 2, 3, 4, 5] },
    },
    pois: [
      {
        id: '00000000-0000-4000-8000-000000024001',
        legacyId: 301,
        building: 'A',
        name: 'Ресепшн и Лобби отеля',
        nameEn: 'Hotel Reception & Lobby',
        floor: 1,
        category: 'entrance',
        filterCategory: 'entrance',
        categoryName: 'Ресепшн',
        categoryNameEn: 'Reception',
        x: 50,
        y: 50,
        planX: 350,
        planY: 250,
        navNodeId: '00000000-0000-4000-8000-000000022001',
        status: 'Свободно',
        statusEn: 'Available',
        statusKind: 'free',
        capacity: '40 человек',
        equipment: 'Стойка регистрации, консьерж-сервис',
        wifi: 'TTK_Corporate (5G)',
        description: 'Корпус A, Этаж 1 | Свободно | 40 человек | Стойка регистрации, консьерж-сервис | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
        icon: 'home',
      },
      {
        id: '00000000-0000-4000-8000-000000024002',
        legacyId: 302,
        building: 'A',
        name: 'Ресторан «Бордо»',
        nameEn: 'Bordeaux Restaurant',
        floor: 2,
        category: 'service_desk',
        filterCategory: 'service',
        categoryName: 'Ресторан',
        categoryNameEn: 'Restaurant',
        x: 65,
        y: 35,
        planX: 455,
        planY: 175,
        navNodeId: '00000000-0000-4000-8000-000000022002',
        status: 'Открыто',
        statusEn: 'Open',
        statusKind: 'bookable',
        capacity: '80 человек',
        equipment: 'Шведский стол, Винная карта, VIP-ложа',
        wifi: 'TTK_Corporate (5G)',
        description:
          'Корпус A, Этаж 2 | Открыто | 80 человек | Шведский стол, Винная карта, VIP-ложа | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
        icon: 'utensils',
      },
    ],
  },
  hub: {
    id: 'hub',
    mapId: '00000000-0000-4000-8000-000000000104',
    slug: 'ttkinnovationithubspaceaaa',
    name: 'Инновационный IT-Хаб ТТК',
    nameEn: 'TTK Innovation IT-Hub',
    type: 'Коворкинг и инкубатор',
    typeEn: 'Coworking & Incubator',
    price: 'от 900 ₽ / день',
    desc: 'Пространство для разработчиков, инженеров и IT-специалистов. Высокоскоростной доступ в сеть и лаборатории.',
    descEn: 'Hub for developers, engineers and IT specialists. High-speed network access and labs.',
    rating: 4.8,
    reviewsCount: 76,
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
    buildings: {
      A: { name: 'Технопарк', nameEn: 'Technopark', floors: [1, 2] },
    },
    pois: [
      {
        id: '00000000-0000-4000-8000-000000034001',
        legacyId: 401,
        building: 'A',
        name: 'Главная серверная лаборатория',
        nameEn: 'Main Server Lab',
        floor: 1,
        category: 'service_desk',
        filterCategory: 'service',
        categoryName: 'Лаборатория',
        categoryNameEn: 'Laboratory',
        x: 45,
        y: 45,
        planX: 315,
        planY: 225,
        navNodeId: '00000000-0000-4000-8000-000000032001',
        status: 'Активно',
        statusEn: 'Active',
        statusKind: 'free',
        capacity: '15 человек',
        equipment: 'Серверные стойки, Тестовые стенды 10G',
        wifi: 'TTK_Corporate (5G)',
        description:
          'Корпус A, Этаж 1 | Активно | 15 человек | Серверные стойки, Тестовые стенды 10G | TTK_Corporate (5G)',
        image: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
        icon: 'cpu',
      },
    ],
  },
};

export function spaceName(space: SpaceDefinition, lang: Lang): string {
  return lang === 'en' && space.nameEn ? space.nameEn : space.name;
}

export function spaceType(space: SpaceDefinition, lang: Lang): string {
  return lang === 'en' && space.typeEn ? space.typeEn : space.type;
}

export function spaceDesc(space: SpaceDefinition, lang: Lang): string {
  return lang === 'en' && space.descEn ? space.descEn : space.desc;
}

export function poiName(poi: RichPoiItem, lang: Lang): string {
  return lang === 'en' && poi.nameEn ? poi.nameEn : poi.name;
}

export function poiStatus(poi: RichPoiItem, lang: Lang): string {
  return lang === 'en' && poi.statusEn ? poi.statusEn : poi.status;
}

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
  index = 0,
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

  const filterCategory: 'meeting' | 'entrance' | 'service' =
    existing?.filterCategory ??
    (poi.category === 'entrance'
      ? 'entrance'
      : poi.category === 'hall'
        ? 'meeting'
        : 'service');

  return {
    id: poi.id,
    legacyId: existing?.legacyId ?? 101 + index,
    building,
    name: poi.title,
    nameEn: existing?.nameEn,
    floor,
    category: poi.category,
    filterCategory,
    categoryName: poi.category_label ?? existing?.categoryName ?? categoryDisplayName(poi.category, poi.category_label),
    categoryNameEn: existing?.categoryNameEn,
    x: Math.min(96, Math.max(4, Math.round((poi.x / Math.max(1, widthUnits)) * 100))),
    y: Math.min(96, Math.max(4, Math.round((poi.y / Math.max(1, heightUnits)) * 100))),
    planX: poi.x,
    planY: poi.y,
    navNodeId: poi.nav_node_id,
    status: parts[1] || existing?.status || 'Свободно',
    statusEn: existing?.statusEn,
    statusKind: existing?.statusKind ?? 'free',
    capacity: parts[2] || existing?.capacity || '25 человек',
    equipment: parts[3] || existing?.equipment || poi.description || 'Стойка информации, Турникеты, Инфо-терминал',
    wifi: parts[4] || existing?.wifi || 'TTK_Corporate (5G)',
    description: poi.description,
    image: existing?.image || fallbackSpace.image,
    icon: existing?.icon || categoryIconName(poi.category),
  };
}

export function mergePublicMapIntoSpace(snapshot: PublicMap, fallbackSpace: SpaceDefinition): SpaceDefinition {
  const enrichedPois = snapshot.document.pois.map((poi, idx) =>
    enrichPoiFromContract(poi, snapshot.width_units, snapshot.height_units, fallbackSpace, idx),
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
