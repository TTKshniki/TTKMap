# TTKMap Frontend

React/TypeScript/Vite. Общие DTO генерируются из `CONTRACTS/openapi.yaml` в `CONTRACTS/types.ts`. Главная `/` использует перенесённый интерфейс `Design` без смены frontend-стека; его адаптер к серверу находится в `features/design/DesignPortal.tsx`.

`App.tsx` связывает Router и страницы. Главный экран и встроенная карта каталога — демонстрационные, они не читают данные карт из API. Вход и выход в портале используют API-сессию; кнопка управления открывает существующий кабинет `/organize`. `/login` остаётся доступным напрямую, `/organize` и `/organize/:mapId` проверяют серверную сессию. Публичные `/m/:slug` и `/embed/:slug` используют один `PublicSpacePage`; поиск в портале открывает опубликованную карту по slug.

- `features/organizer/useWorkspace.ts` владеет серверной revision, локальным draft, assets и сохранением. Ответ 412 сохраняет локальные правки; изменения во время save не затираются. Перед уходом с изменённой карты есть подтверждение.
- `features/plan` содержит SVG редактор, операции документа и inspector. Координаты преобразуются обратной screen CTM; подложка одинакова в редакторе, picker и public view.
- `features/capture` разделяет поток камеры, pending frame в IndexedDB, capture session и polling результата. `captureFrame` используется только как тестовый seam; восстановление файлов работает без него.
- `features/panorama` загружает Pannellum отдельным chunk и использует измеренные `vaov_deg`/`v_offset_deg`. Отсутствующее медиа показывается ошибкой.
- `shared/api.ts` экспортирует `apiClient`; CSRF хранится в памяти. Публикация и logout подтверждаются ответом сервера.

Команды из корня (Node 22.12+):

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run test:e2e
```

Для Vite `APP_ORIGIN` backend должен совпадать с адресом frontend (`http://127.0.0.1:5173`); API proxy идёт на порт 8000. Production frontend собирается в Docker вместе с локальным CSS. E2E требует Docker и Chromium Playwright; рабочие данные не затрагиваются. Реальные физические устройства принимаются отдельно: `docs/acceptance.md`.
