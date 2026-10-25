# TTKMap

TTKMap — сервис интерактивных карт пространств. Организатор собирает карту здания или площадки, а посетитель открывает её по стабильной ссылке или во встроенном окне.

В проекте доступны:

- защищённый кабинет организатора с картами, этажами, 2D-планом, POI, графом проходов и публикацией;
- импорт изображения плана, ручное редактирование геометрии и просмотр объёмной модели;
- мобильный гид съёмки из 16 кадров, загрузка готовой equirectangular-панорамы и отдельный Hugin/enblend worker;
- панорамы с позиционированием на плане, хотспотами и переходами между точками;
- публичные страницы `/m/:slug`, `/embed/:slug`, маршруты, panorama walk и offline-пакет;
- сбор событий посещения и отчёты аналитики для организатора;
- Android-клиент с картой, навигацией, панорамами, съёмкой и локальным кэшем.

Серверная часть использует FastAPI, SQLite с WAL и внешними ключами, React/TypeScript/Vite отвечает за веб-интерфейс, а worker запускается отдельным процессом. DTO и HTTP-контракт находятся в `CONTRACTS/`.

## Быстрый запуск

Нужны Docker Engine с Compose, Node.js 22.12+ для локального frontend и Python 3.12 для скриптов.

```sh
cp .env.example .env
docker compose build
docker compose run --rm api python -m backend.app.cli init-db
docker compose run --rm api python -m backend.app.cli create-organizer --email organizer@example.com
docker compose up -d api worker
```

При создании организатора CLI запросит пароль. Локальный интерфейс откроется на `http://127.0.0.1:8000`. В `.env` укажите точный `APP_ORIGIN`; для HTTPS используйте `COOKIE_SECURE=true`.

Для развёртывания на Ubuntu/Debian VPS используйте интерактивный скрипт:

```sh
./scripts/deploy_vps.sh
```

Скрипт спрашивает адрес VPS, пользователя, SSH-ключ или пароль, домен/A-запись (если есть), почту владельца сертификата и данные первого организатора. Он устанавливает Docker и nginx, собирает Compose-стек, настраивает reverse proxy и получает сертификат Let's Encrypt для домена.

## Веб-разработка

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
npm --prefix frontend run test
npm --prefix frontend run build
```

Vite использует API на порту 8000. Для камеры браузер должен работать в защищённом контексте HTTPS.

## Проверки

```sh
python3 scripts/check_contracts.py
python3 scripts/generate_types.py --check
npm --prefix frontend run test
npm --prefix frontend run build
docker compose --profile test build backend-test
docker compose --profile test run --rm backend-test python -m pytest backend/tests -q
npm --prefix frontend run test:e2e
git diff --check
```

E2E запускает изолированные контейнеры и отдельную SQLite-базу. Данные приложения хранятся в Docker volume `ttkmap-data`. Для резервной копии остановите `api` и `worker`, затем выполните:

```sh
docker compose run --rm api python -m backend.app.cli backup /data/backups/backup
```

## Контракты и данные

- `CONTRACTS/openapi.yaml` описывает HTTP API.
- `CONTRACTS/types.ts` содержит общие TypeScript DTO.
- `CONTRACTS/db_schema.sql` и `CONTRACTS/migrations/` описывают SQLite-схему.

Изменение OpenAPI сопровождается запуском `python3 scripts/generate_types.py`. Существующая база не пересоздаётся автоматически; миграции выполняются отдельной командой с резервной копией.

## Expert showcase

Для экспертной демонстрации доступна эталонная карта `TTK Digital Campus`:

- публичная ссылка: `http://localhost:8000/m/ttkshowcampusmapdemoaaaaaa`;
- локальная подготовка и сценарий: [`docs/demo.md`](docs/demo.md);
- демо-план и 360°-сцены явно являются синтетическими иллюстрациями, а не реальной съёмкой или результатом stitching.
