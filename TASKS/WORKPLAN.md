# TTKMap: план работ для 3 участников

Основа (`ttk-foundation`) готова. Рабочие задачи MVP ниже распределены по трём независимым дорожкам. Начинайте задачу, когда завершены только перечисленные зависимости; задачи разных дорожек можно вести одновременно.

Перед изменениями прочитайте `CONTRACTS/AGENTS.md`. Работайте только в путях своей задачи. Ставьте задаче статус завершения только после merge PR в `main`; до этого она остаётся открытой. После merge отметьте её здесь и установите `state: complete` для того же ID в `manifest.json`. Контракт API уже зафиксирован; изменения OpenAPI/DTO требуют отдельной общей договорённости до параллельной работы.

GitHub Actions CI настроен в `.github/workflows/ci.yml`. Он запускает контрактную проверку, backend-тесты, frontend test/build, `git diff --check` и проверку `allowed_paths` по task ID в заголовке PR. Команды `verify_cmd` ниже остаются локальными проверками задачи: их запускает владелец и прикладывает результат к PR, а второй участник делает review по diff.

## Участник A: backend и маршрутизация

### A1. Закрепить backend-зависимости

- [ ] `ttk-backend-lock`
- Результат: hash-pinned `requirements.lock`, установка Docker-образа только из lock-файла.
- Пути: `backend/Dockerfile`, `backend/requirements.lock`, `backend/requirements-lock-tool.txt`.
- Проверка: `docker compose --profile test run --rm backend-test python -m pytest backend/tests -q`.

### A2. Закрыть auth и ownership

- [ ] `ttk-auth-hardening` (после A1)
- Результат: завершённые login/session/logout и тесты анонимного доступа, CSRF/Origin, rate limit и доступа к чужой карте.
- Пути: `backend/app/auth.py`, `backend/app/routers/auth.py`, `backend/tests/auth/**`.
- Проверка: `docker compose --profile test run --rm backend-test python -m pytest backend/tests/auth -q`.

### A3. Завершить валидацию документа карты

- [ ] `ttk-map-validation` (после A2)
- Результат: bounds, ID, геометрия, связи asset/POI/hotspot, publish gate и атомарный rollback проверены тестами.
- Пути: `backend/app/routers/maps.py`, `backend/app/schemas.py`, `backend/tests/maps/**`.
- Проверка: `docker compose --profile test run --rm backend-test python -m pytest backend/tests/maps -q`.

### A4. Закрыть публичный снимок и маршруты

- [ ] `ttk-public-routing` (после A3; можно параллельно с C2)
- Результат: ETag/no-cache, Dijkstra с детерминированным выбором, корректные gaps панорамного прохода и отсутствие приватных данных в ответе.
- Пути: `backend/app/routers/public.py`, `backend/tests/routing/**`.
- Проверка: `docker compose --profile test run --rm backend-test python -m pytest backend/tests/routing -q`.

## Участник B: frontend организатора и посетителя

### B1. Закрепить frontend-зависимости

- [ ] `ttk-frontend-lock`
- Результат: `package-lock.json` формата lockfileVersion 3; установка поддерживается через `npm ci`.
- Пути: `frontend/package-lock.json`.
- Проверка: `npm --prefix frontend run test`.

### B2. Завершить API client и session lifecycle

- [ ] `ttk-frontend-core` (после B1)
- Результат: обработка ошибок API, 204/304, CSRF в памяти, ETag/If-Match и координатные helpers покрыты тестами.
- Пути: `frontend/src/shared/**`, `frontend/src/app/**`.
- Проверка: `npm --prefix frontend run test -- src/shared`.

### B3. Кабинет организатора

- [ ] `ttk-organizer-ui` (после B2 и A2)
- Результат: настоящий login/logout, список и создание карт, сохранение, 412-конфликт, publish/unpublish, стабильная ссылка и iframe.
- Пути: `frontend/src/features/organizer/**`.
- Проверка: `npm --prefix frontend run test -- src/features/organizer`.

### B4. SVG-редактор плана

- [ ] `ttk-plan-editor` (после B2 и C2)
- Результат: импорт отображаемой подложки, ручное редактирование геометрии и POI, граф проходов, мобильный ввод и сохранение локальных координат.
- Пути: `frontend/src/features/plan/**`.
- Проверка: `npm --prefix frontend run test -- src/features/plan`.

### B5. Viewer и hotspot editor

- [ ] `ttk-panorama-ui` (после B2 и C2; независимо от B4)
- Результат: настоящий Pannellum viewer, подходящий вариант медиа, pitch/vaov, POI-hotspots и направленные переходы.
- Пути: `frontend/src/features/panorama/**`.
- Проверка: `npm --prefix frontend run test -- src/features/panorama`.

### B6. Публичный visitor UI

- [ ] `ttk-visitor-ui` (после B2, A4 и B5)
- Результат: `/m/:slug` и `/embed/:slug` загружают карту по любому опубликованному slug, показывают POI, маршрут, панорамы и live-обновления.
- Пути: `frontend/src/features/visitor/**`.
- Проверка: `npm --prefix frontend run test -- src/features/visitor`.

## Участник C: медиа, съёмка и worker

### C1. Подготовить реальные серии для stitching

- [ ] `ttk-stitch-fixtures` (независимо от остальных задач)
- Результат: лицензированные серии с 16 кадрами, manifest происхождения, готовая сфера и отрицательные наборы для тестов.
- Пути: `backend/tests/fixtures/stitch/**`, `docs/capture_samples.md`.
- Проверка: в manifest указаны все файлы, устройство, порядок и покрытие; синтетические изображения не выдаются за съёмку с устройства.

### C2. API медиа и защищённая выдача

- [ ] `ttk-media-api` (после A2; параллельно с A3)
- Результат: проверка содержимого, лимитов и EXIF, варианты preview/mobile/full, атомарная запись и авторизационная проверка до 304.
- Пути: `backend/app/routers/media.py`, `backend/app/modules/media/**`, `backend/tests/media/**`.
- Проверка: `docker compose --profile test run --rm backend-test python -m pytest backend/tests/media -q`.

### C3. Capture API и очередь

- [ ] `ttk-capture-api` (после C2)
- Результат: сессии, идемпотентные 16 слотов, retry/cancel, ownership и durable очередь с ограничением попыток.
- Пути: `backend/app/routers/captures.py`, `backend/app/modules/capture/**`, `backend/tests/capture/**`.
- Проверка: `docker compose --profile test run --rm backend-test python -m pytest backend/tests/capture -q`.

### C4. Worker Hugin/enblend

- [ ] `ttk-stitch-worker` (после C1 и C3)
- Результат: отдельный worker с lease/heartbeat, отменой, таймаутом, измерением качества панорамы и настоящими integration tests.
- Пути: `backend/worker/**`, `backend/tests/stitch/**`.
- Проверка: `docker compose --profile test run --rm backend-test python -m pytest backend/tests/stitch -q`.

### C5. Мобильный capture UI

- [ ] `ttk-capture-ui` (после B2, C3 и C4)
- Результат: HTTPS-камера, ориентир и шаг 22,5°, preview/retake, последовательная загрузка, восстановление очереди, retry/cancel/failed и отдельная загрузка готовой сферы.
- Пути: `frontend/src/features/capture/**`.
- Проверка: `npm --prefix frontend run test -- src/features/capture`.

## Совместная интеграция

Начинать после задач B3-B6, C4 и C5. Это один ID манифеста, но пути разделены между участниками:

- [ ] `ttk-integration`
- Участник A: `backend/app/main.py`, `backend/tests/integration/**`, `scripts/seed_demo.py`.
- Участник B: `frontend/index.html`, `frontend/src/App.tsx`, `frontend/src/styles.css`, `frontend/src/shared/**`, `frontend/src/features/**`, `frontend/e2e/**`, `scripts/e2e.mjs`, `frontend/package.json`.
- Участник C: `compose.yaml`, `README.md`, `docs/demo.md`.
- Результат: backend и worker запускаются вместе, frontend подключён к реальным API, E2E проверяет путь организатора и посетителя, embed и live update.
- Проверка: `npm --prefix frontend run test:e2e`, затем backend и frontend проверки из корня по отдельности.

## Приёмка на устройствах

- [ ] `ttk-device-acceptance` (после интеграции)
- Ответственный: участник C координирует, B проходит visitor/UI сценарии, A проверяет сервис и API.
- Путь: `docs/acceptance.md`, `docs/measurements/**`.
- Результат: реальные сценарии на iOS Safari и Android Chrome по HTTPS, включая удачную и неудачную склейку, embed, производительность и touch UX; в отчёте есть устройства, версии и измерения.

## Порядок параллельной работы

1. Старт одновременно: A1, B1, C1.
2. После lock-файлов: A2 и B2. C1 может продолжаться независимо.
3. После A2: A3, B3 и C2 идут параллельно.
4. После A3: A4. После C2: C3 и B4/B5 могут идти параллельно; B3 не блокирует эти задачи.
5. После C1 и C3: C4. После зависимостей B6 и C5 завершаются независимо друг от друга.
6. Затем совместная интеграция и device acceptance.

Проверяйте зависимости конкретной задачи, а не ждите закрытия всей предыдущей волны. Backlog (offline, этажи, аналитика, AI-распознавание плана, несколько зданий, полная 3D-реконструкция) в этот MVP-план не входит.

## Git и pull request

Используйте короткую ветку на одну задачу: `task/ttk-auth-hardening`, `task/ttk-plan-editor` и так далее. Не работайте прямо в `main` и не держите одну ветку на весь срок проекта. Владелец задачи открывает Draft PR сразу, когда появился первый проверяемый результат; это даёт команде видимость прогресса, даже если задача ещё не готова к merge.

У каждого участника должен быть отдельный clone или `git worktree`. Не переключайте ветки и не редактируйте один checkout втроём: Git branch принадлежит всему checkout, а незакоммиченные изменения там общие.

```text
git switch main
git pull --ff-only origin main
git switch -c task/ttk-auth-hardening
# работа только в путях задачи
git add backend/app/auth.py backend/app/routers/auth.py backend/tests/auth
git commit -m "ttk-auth-hardening: close organizer auth checks"
git push -u origin task/ttk-auth-hardening
```

Один PR закрывает один task ID и меняет только его разрешённые пути. В заголовке укажите ID задачи. Перед merge запустите проверку задачи, пройдите review и синхронизируйте ветку с актуальным `main`, если появились новые коммиты. GitHub workflow также отклонит PR, если заголовок не содержит task ID или изменены файлы вне `allowed_paths`. После merge удалите ветку, отметьте ID завершённым в этом плане и в `manifest.json`.

Минимальный review PR:

- изменены только `allowed_paths` своей задачи;
- команда `verify_cmd` запущена и результат указан в PR;
- нет незапланированного изменения контракта, схемы или shared-кода;
- негативные сценарии задачи покрыты тестом или явно отмечены как остаточный риск;
- второй участник посмотрел diff и подтвердил, что задача не ломает согласованные зависимости.

Задача-зависимость должна быть смержена прежде, чем начинать её потомка от `main`. Так потомок получает уже интегрированный код, а не локальную копию чужой ветки. Если PR устарел, владелец обновляет его из `main` и решает конфликты в своей ветке; не переписывайте чужую ветку и не делайте force-push в `main`.

При конфликте сначала сверяйте область владения по этому плану. Не решайте его выбором «ours/theirs» вслепую: оставьте оба нужных изменения, запустите проверки затронутой задачи, затем повторите общие проверки. Общие файлы `CONTRACTS/*`, `frontend/src/shared/*`, `backend/app/main.py`, `frontend/src/App.tsx` и `compose.yaml` меняются только в выделенной для них задаче или согласованной интеграции.
