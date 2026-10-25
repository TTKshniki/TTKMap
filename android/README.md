# TTKMap Android — Нативное приложение (Material 3 Expressive × Дизайн-код ТТК)

Нативный Android-клиент платформы интерактивных карт пространств **TTKMap** («Карта пространства» для ТТК / ТрансТелеКом), полностью совместимый с контрактом `CONTRACTS/openapi.yaml` и `CONTRACTS/types.ts`.

## Дизайн-система: Material 3 Expressive × ТТК

Визуальный язык объединяет **Material Design 3 Expressive** и фирменный стиль ТТК + текущего веб-фронтенда (`frontend/src/styles.css`, `frontend/src/features/visitor/visitor.css`):

- **Цветовая палитра (`ui/theme/Color.kt`)**:
  - `TtkRed` (`#D71920`) / `TtkBrandRed` (`#E31B23`) — основные акценты, кнопки действий, активные пины и анимированная линия маршрута.
  - `TtkDeepTeal` (`#203C3C`) и `TtkGreen` (`#1D6860`) — выразительные Hero-карточки, HUD-панели 360°-панорам и индикаторы совпадения компаса при съёмке.
  - `TtkCanvas` (`#F3F6F4`), `TtkInk` (`#1C292D`), `TtkLine` (`#DCE3DF`) — светлая техническая подложка и контуры, плюс полноценная тёмная тема (`#0B1516` / `#132324`).
  - **Семантические цвета категорий POI**: `booth` (`#E31B23`), `hall` (`#1D6860`), `entrance` (`#16A34A`), `service_desk` (`#7C3AED`), `wifi` (`#2563EB`), `custom` (`#475569`).
- **Expressive-компоненты и физика (`ui/theme/Theme.kt`, `TtkBrandComponents.kt`)**:
  - Крупные скругления контейнеров (`24dp–32dp`) в сочетании с чёткими техническими элементами управления (`10dp–12dp`).
  - Пружинная анимация (`Spring.DampingRatioLowBouncy`), пульсирующие маркеры панорам, бегущий пунктир маршрута и живой индикатор `Live · v{revision}`.

## Архитектура проекта (`android/app/src/main/java/ru/ttk/map/`)

```text
ru.ttk.map
├── TtkMapApplication.kt             # DI-контейнер: OkHttp/Retrofit, Room DB, Coil ImageLoader (120 МБ кэш)
├── MainActivity.kt                  # Compose Navigation + обработка Deep Links (/m/:slug и ttkmap://m/:slug)
├── ui/
│   ├── theme/
│   │   ├── Color.kt                 # Палитра ТТК и семантические токены категорий/плана
│   │   ├── Theme.kt                 # Material 3 Expressive Shapes, Typography, Spring Motion
│   │   └── TtkBrandComponents.kt    # TtkBrandLockup, TtkEyebrow, TtkLiveBadge, TtkStatusTag, TtkFilterChip
│   └── components/
│       └── Interactive2DPlanCanvas.kt # Мультитач 2D-план (Pinch-to-Zoom, Pan, комнаты/стены, POI, маршрут)
├── core/
│   ├── model/CoreModels.kt          # 1:1 DTO из CONTRACTS/types.ts (kotlinx.serialization snake_case)
│   ├── domain/
│   │   ├── CoordinateMath.kt        # Нормализация углов [-180, 180), азимуты, pitchBounds (vaov_deg/v_offset_deg)
│   │   ├── LocalRouteEngine.kt      # Офлайн-алгоритм Дейкстры + сборщик PanoramaWalk и локализация WalkGaps
│   │   └── CaptureGuideLogic.kt     # Расчёт 16 шагов × 22,5°, допуск компаса ±8°, прогресс и подсказки ошибок
│   ├── network/
│   │   ├── TtkApiService.kt         # Все эндпоинты CONTRACTS/openapi.yaml
│   │   └── TtkNetworkEnvironment.kt # CookieJar (ttk_session), X-CSRF-Token, Origin, If-Match / If-None-Match ETag
│   ├── database/
│   │   └── TtkDatabase.kt           # Room SQLite: кэш карт (Offline-first) и очередь неотправленных кадров съёмки
│   └── repository/
│       └── TtkMapRepository.kt      # Синхронизация сети и Room, обработка 304 Not Modified и 412 Conflict
└── feature/
    ├── home/HomeHubScreen.kt        # Главный хаб (Посетитель, Демо-кампус ТТК Экспо, Организатор, Настройки API)
    ├── visitor/VisitorSpaceScreen.kt # Модуль 3: 2D-карта, фильтр POI, маршрут А→Б, виртуальный проход 360°, Live-пуллинг 15с
    ├── panorama/Panorama360Sheet.kt # 360° сферический вьюер (Equirectangular + Гироскоп + Редактор хотспотов)
    ├── capture/GuidedCaptureScreen.kt # Модуль 2: CameraX видоискатель, 16 кадров с компасом, Ghost-оверлей, Hugin-очередь
    └── organizer/OrganizerScreens.kt # Модуль 1: Вход, список карт, редактор 2D-плана, инспектор POI/панорам, публикация
```

## Сборка и запуск

1. Откройте каталог `android/` в **Android Studio (Ladybug / Meerkat или новее)** с Android SDK 35 и JDK 17.
2. Запустите бэкенд TTKMap в корне репозитория (`docker compose up -d api worker`).
3. На эмуляторе Android адрес `http://10.0.2.2:8000` и заголовок `Origin: http://127.0.0.1:8000` настроены по умолчанию (также их можно изменить прямо в приложении через кнопку **API Online / Офлайн** в верхней панели).
4. Для мгновенной демонстрации без поднятого сервера нажмите на главном экране карточку **«Демо-площадка: ТТК Экспо · Цифровой кампус»** — она работает полностью офлайн через Room SQLite и `LocalRouteEngine`.
