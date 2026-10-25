import { Language, SpaceItem, SpaceKey, TranslationDictionary } from '../types';

/* ========================================================================== */
/* СЛОВАРЬ МЕЖДУНАРОДНОЙ ЛОКАЛИЗАЦИИ (РУССКИЙ И АНГЛИЙСКИЙ ЯЗЫКИ)              */
/* ========================================================================== */
export const i18n: Record<Language, TranslationDictionary> = {
  ru: {
    routeCalcTitle: "Построение и расчет маршрута",
    routeFromLabel: "ТОЧКА ОТПРАВЛЕНИЯ (А):",
    routeToLabel: "ТОЧКА НАЗНАЧЕНИЯ (В):",
    routeParamsTitle: "Параметры маршрута:",
    paramLength: "Длина пути: 150 метров",
    paramTime: "Время ходьбы: ~2 мин",
    paramAccessible: "Без ступеней (Безбарьерная среда): Да",
    showOnMapBtn: "Отобразить на интерактивной карте",
    stepInstructionTitle: "Пошаговая инструкция пути:",
    step1Title: "Пройдите от входа к центральному холлу",
    step1Desc: "Расстояние 40 метров, прямо вдоль брендированной стены ТТК",
    step2Title: "Поднимитесь на 3 этаж и поверните налево",
    step2Desc: "Возможно воспользоваться лифтом или эскалатором",
    step3Title: "Цель справа: Переговорная Альфа",
    step3Desc: "Стеклянные двери с цифровой табличкой доступа",
    navSpaces: "Пространства",
    navMap: "Карта здания",
    navCabinet: "Избранное",
    navAdmin: "Управление картами",
    navLogin: "Войти",
    searchPlaceholder: "Поиск помещений или объектов...",
    heroTitle: "Карта пространства и панорамы 360°",
    heroDesc: "Интерактивная карта здания, точные маршруты от входа и панорамы 360°. Создавайте и редактируйте планировки для вашего бизнеса.",
    openMapBtn: "Открыть карту пространства",
    searchPhotoBtn: "Найти объект по фото",
    spacesTitle: "Пространства и объекты",
    spacesSub: "Интерактивная навигация и поэтажные планы помещений.",
    buildingLabel: "Корпус:",
    floorLabel: "Этаж",
    routeTitle: "Построение маршрута",
    routeFrom: "Точка отправления (А)",
    routeTo: "Точка назначения (В)",
    buildRouteBtn: "Построить маршрут",
    resetBtn: "Сбросить",
    panoBtn: "360° Панорама",
    capacity: "Вместимость",
    equipment: "Оборудование",
    wifi: "Wi-Fi покрытие",
    statusFree: "Свободно",
    statusBusy: "Занято",
    statusBookable: "Можно забронировать",
    routeHere: "Маршрут сюда",
    analyticsTitle: "Аналитика посещаемости и пространств",
    analyticsSub: "Статистика просмотров интерактивной карты, популярных маршрутов и плотности потока",
    editorTitle: "Редактор точек, съемка и ИИ-планы",
    authTitle: "Вход организатора",
    loginBtn: "Войти в систему",
    offlineModeOn: "Офлайн-режим",
    offlineModeOff: "Онлайн",
    privacyApi: "Конфиденциальность API",
    termsLink: "Условия использования",
    footerCopy: "© 2026 ТТК (ТрансТелеком). Все права защищены.",
    adminLinkTitle: "Управлять картами",
    changeObject: "Сменить объект",
    officialPartner: "Официальный партнер",
    floorPlan: "План этажа",
    filterAll: "Все",
    filterMeeting: "Переговорные",
    filterEntrance: "Входы",
    filterService: "Стойки",
    routeBuildingHeader: "ПОСТРОЕНИЕ МАРШРУТА",
    timeText: "Время: 2 мин",
    distanceText: "Дистанция: 145 м",
    routeDescText: "Маршрут автоматически строится от главной входной двери по коридорам и проемам здания.",
    walkPanoBtn: "Пройти по панорамам",
    capacityText: "Вместимость:",
    equipmentText: "Оборудование:",
    statusTextTitle: "Статус:",
    wifiText: "Wi-Fi покрытие:",
    shareRouteQrBtn: "Поделиться маршрутом (QR-код)",
    editorToolsTitle: "1. Инструменты разметки",
    drawWallBtn: "Нарисовать стену",
    addPoiBtn: "Добавить POI",
    wifiZoneBtn: "Зона Wi-Fi",
    entranceExitBtn: "Вход/Выход",
    phoneCamMasterTitle: "2. Мастер съемки панорам с телефона",
    phoneCamMasterDesc: "Инструкция и гид по сшивке серий кадров",
    startCamAssistantBtn: "Запустить помощник съемки",
    interactiveCanvasTitle: "Интерактивный холст 2D разметки",
    uploadBlueprintBtn: "Загрузить файл планировки (SVG / DWG / PNG)",
    favoritesHeader: "Избранные объекты",
    savedObjectDesc: "Сохраненный объект",
    goToMapBtn: "Перейти на карту",
    footerServiceText: "Сервис навигации внутри зданий и мероприятий.",
    aiCreatePlan: "Авто-создание 2D плана (ИИ)",
    saveChanges: "Сохранить изменения",
    editorTabTitle: "Редактор и Инструменты",
    moreVenuesTitle: "Больше объектов ТТК",
    moreVenuesDesc: "Исследуйте расширенную базу данных офисов, залов и лабораторий по всей стране.",
    viewMoreBtn: "Смотреть далее"
  },
  en: {
    routeCalcTitle: "Route Calculation & Building",
    routeFromLabel: "ORIGIN POINT (A):",
    routeToLabel: "DESTINATION POINT (B):",
    routeParamsTitle: "Route parameters:",
    paramLength: "Path length: 150 meters",
    paramTime: "Walking time: ~2 min",
    paramAccessible: "Step-free access (Accessible): Yes",
    showOnMapBtn: "Show on interactive map",
    stepInstructionTitle: "Step-by-step route guide:",
    step1Title: "Walk from entrance to the central hall",
    step1Desc: "Distance 40 meters, straight along TTK branded wall",
    step2Title: "Go up to the 3rd floor and turn left",
    step2Desc: "Elevator or escalator can be used",
    step3Title: "Destination on the right: Alfa Meeting Room",
    step3Desc: "Glass doors with digital access keypad",
    navSpaces: "Spaces",
    navMap: "Building Map",
    navCabinet: "Favorites",
    navAdmin: "Manage Maps",
    navLogin: "Sign In",
    searchPlaceholder: "Search rooms or objects...",
    heroTitle: "Space Map & 360° Panoramas",
    heroDesc: "Interactive building map, precise routes from entrance, and 360° panoramas. Create and edit floor plans for your business.",
    openMapBtn: "Open building map",
    searchPhotoBtn: "Search by Photo",
    spacesTitle: "Spaces & Venues",
    spacesSub: "Interactive indoor navigation and floor plans.",
    buildingLabel: "Building:",
    floorLabel: "Floor",
    routeTitle: "Route Builder",
    routeFrom: "From (My Location)",
    routeTo: "To (Destination)",
    buildRouteBtn: "Build Route",
    resetBtn: "Reset",
    panoBtn: "360° Panorama",
    capacity: "Capacity",
    equipment: "Equipment",
    wifi: "Wi-Fi Coverage",
    statusFree: "Available",
    statusBusy: "Occupied",
    statusBookable: "Bookable",
    routeHere: "Route Here",
    analyticsTitle: "Attendance & Space Analytics",
    analyticsSub: "Interactive map view statistics, popular routes, and peak traffic density",
    editorTitle: "Point Editor, Capture & AI Blueprints",
    authTitle: "Organizer sign in",
    loginBtn: "Log In",
    offlineModeOn: "Offline Mode",
    offlineModeOff: "Online",
    privacyApi: "API Privacy",
    termsLink: "Terms of Use",
    footerCopy: "© 2026 TTK (TransTeleCom). All rights reserved.",
    adminLinkTitle: "Manage maps",
    changeObject: "Change Object",
    officialPartner: "Official Partner",
    floorPlan: "Floor Plan",
    filterAll: "All",
    filterMeeting: "Meeting Rooms",
    filterEntrance: "Entrances",
    filterService: "Stands",
    routeBuildingHeader: "ROUTE BUILDING",
    timeText: "Time: 2 min",
    distanceText: "Distance: 145 m",
    routeDescText: "The route is automatically generated from the main entrance door along hallways and doorways.",
    walkPanoBtn: "Walk Panoramas",
    capacityText: "Capacity:",
    equipmentText: "Equipment:",
    statusTextTitle: "Status:",
    wifiText: "Wi-Fi Coverage:",
    shareRouteQrBtn: "Share Route (QR Code)",
    editorToolsTitle: "1. Markup Tools",
    drawWallBtn: "Draw Wall",
    addPoiBtn: "Add POI",
    wifiZoneBtn: "Wi-Fi Zone",
    entranceExitBtn: "Entrance/Exit",
    phoneCamMasterTitle: "2. Phone Panorama Capture Master",
    phoneCamMasterDesc: "Guide and instructions for stitching photo series",
    startCamAssistantBtn: "Start Camera Assistant",
    interactiveCanvasTitle: "Interactive 2D Markup Canvas",
    uploadBlueprintBtn: "Upload Blueprint File (SVG / DWG / PNG)",
    favoritesHeader: "Favorite Objects",
    savedObjectDesc: "Saved Object",
    goToMapBtn: "Go to Map",
    footerServiceText: "Indoor and event navigation service.",
    aiCreatePlan: "AI 2D Plan Generation",
    saveChanges: "Save Changes",
    editorTabTitle: "Editor & Tools",
    moreVenuesTitle: "More TTK Venues",
    moreVenuesDesc: "Explore extended database of offices, halls and labs nationwide.",
    viewMoreBtn: "View More"
  }
};

/* ========================================================================== */
/* БАЗА ДАННЫХ ОБЪЕКТОВ И ТОЧЕК ИНТЕРЕСА (SPACES DATA)                        */
/* ========================================================================== */
export const spacesData: Record<SpaceKey, SpaceItem> = {
  plaza: {
    id: 'plaza',
    name: { ru: 'Бизнес-центр «ТТК Плаза»', en: 'Business Center "TTK Plaza"' },
    type: { ru: 'Бизнес-центр класса А', en: 'Class A Business Center' },
    price: 'от 1 200 ₽ / час',
    desc: {
      ru: 'Главный офис ТрансТелеком. Переговорные комнаты, серверные узлы, кофе-пойнты и комфортные зоны отдыха.',
      en: 'TransTeleCom Head Office. Meeting rooms, server rooms, coffee points and lounge areas.'
    },
    rating: 4.9,
    reviewsCount: 128,
    image: '/photos/photo-1.jpg',
    buildings: {
      A: {
        name: { ru: 'Корпус А (Главный)', en: 'Building A (Main)' },
        floors: [1, 2, 3]
      },
      B: {
        name: { ru: 'Корпус B (Конгресс-холл)', en: 'Building B (Congress Hall)' },
        floors: [1, 2]
      }
    },
    pois: [
      {
        id: 1,
        building: 'A',
        name: { ru: 'Главный вход и Центральный ресепшн', en: 'Main Entrance & Central Reception' },
        floor: 1,
        category: 'entrance',
        categoryName: { ru: 'Вход / Ресепшн', en: 'Entrance / Reception' },
        x: 25,
        y: 30,
        status: 'free',
        statusText: { ru: 'Свободно', en: 'Available' },
        capacity: '50 человек',
        equipment: 'Стойка информации, Турникеты, Инфо-терминал',
        wifi: 'TTK_Corporate (5G)',
        image: '/photos/photo-4.jpg',
        icon: 'door-open'
      },
      {
        id: 2,
        building: 'A',
        name: { ru: 'Переговорная Альфа', en: 'Alfa Meeting Room' },
        floor: 3,
        category: 'meeting',
        categoryName: { ru: 'Переговорная', en: 'Meeting Room' },
        x: 55,
        y: 30,
        status: 'bookable',
        statusText: { ru: 'Свободно', en: 'Available' },
        capacity: '10 человек',
        equipment: 'Проектор, маркерная доска, ВКС система',
        wifi: 'TTK_Corporate (5G)',
        image: '/photos/photo-7.jpg',
        icon: 'users'
      }
    ]
  },
  expo: {
    id: 'expo',
    name: { ru: 'Выставочный комплекс «Экспо-Сити»', en: 'Exhibition Complex "Expo-City"' },
    type: { ru: 'Выставочный павильон', en: 'Exhibition Pavilion' },
    price: 'от 3 500 ₽ / кв.м',
    desc: {
      ru: 'Инновационный форум связи и телекоммуникаций. Стенды партнёров и интерактивные зоны нетворкинга.',
      en: 'Innovative telecom forum. Partner booths and interactive networking areas.'
    },
    rating: 4.7,
    reviewsCount: 94,
    image: '/photos/photo-10.jpg',
    buildings: {
      A: {
        name: { ru: 'Павильон №1', en: 'Pavilion No. 1' },
        floors: [1, 2]
      }
    },
    pois: []
  },
  hotel: {
    id: 'hotel',
    name: { ru: 'Отель «Гранд Сити»', en: 'Grand City Hotel' },
    type: { ru: 'Конференц-отель 5★', en: 'Conference Hotel 5★' },
    price: 'от 8 500 ₽ / сутки',
    desc: {
      ru: 'Конференц-отель с панорамными номерами, современным спа-комплексом и ресторанами высокой кухни.',
      en: 'Conference hotel with panoramic rooms, spa complex and fine dining.'
    },
    rating: 4.9,
    reviewsCount: 215,
    image: '/photos/photo-13.jpg',
    buildings: {
      A: {
        name: { ru: 'Главный Корпус', en: 'Main Building' },
        floors: [1, 2, 3]
      }
    },
    pois: []
  },
  hub: {
    id: 'hub',
    name: { ru: 'Инновационный IT-Хаб ТТК', en: 'TTK Innovation IT-Hub' },
    type: { ru: 'Коворкинг и инкубатор', en: 'Coworking & Incubator' },
    price: 'от 900 ₽ / день',
    desc: {
      ru: 'Пространство для разработчиков, инженеров и IT-специалистов. Высокоскоростной доступ в сеть и лаборатории.',
      en: 'Hub for developers, engineers and IT specialists. High-speed network access and labs.'
    },
    rating: 4.8,
    reviewsCount: 76,
    image: '/photos/photo-4.jpg',
    buildings: {
      A: {
        name: { ru: 'Технопарк', en: 'Technopark' },
        floors: [1, 2]
      }
    },
    pois: []
  },
  center: {
    id: 'center',
    name: { ru: 'Технологический Центр ТТК', en: 'TTK Technology Center' },
    type: { ru: 'Инжиниринговый центр', en: 'Engineering Center' },
    price: 'от 1 500 ₽ / час',
    desc: {
      ru: 'Современный центр тестирования телекоммуникационного оборудования и дата-центров.',
      en: 'Modern testing center for telecom equipment and data centers.'
    },
    rating: 4.9,
    reviewsCount: 64,
    image: '/photos/photo-16.jpg',
    buildings: {
      A: {
        name: { ru: 'Корпус Инженерии', en: 'Engineering Building' },
        floors: [1, 2]
      }
    },
    pois: []
  }
};

export const SPACE_LIST: SpaceKey[] = ['hub', 'expo', 'hotel', 'center'];
