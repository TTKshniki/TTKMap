# TTKMap contributor boundaries

The project implements the TTK «Карта пространства» case. The mandatory MVP is defined by `specification.md` and `docs/reference_raw.md`; offline maps, multiple floors, analytics, automatic plan recognition, multiple buildings and full 3D reconstruction are backlog.

Read `CONTRACTS/AGENTS.md` before implementation and `TASKS/manifest.json` before claiming a work item. Keep edits within the assigned `allowed_paths`. Do not add a generic Items CRUD example. Do not publish repository changes or interact with VibeTeamOS Hub unless explicitly asked.

`CONTRACTS/openapi.yaml` is the API source of truth. `CONTRACTS/types.ts` is the shared TypeScript DTO module. A contract change must be coordinated before backend/frontend changes. Identifiers are UUIDv4; plan coordinates are local units (top-left origin, X right, Y down); panorama angles are degrees. All API errors use the documented envelope.

The backend uses Python 3.12/FastAPI/SQLite. Each connection enables foreign keys, WAL and a busy timeout. SQLite schema initialization is for an empty database only; never delete or recreate an existing database to make tests pass. The frontend uses React/TypeScript/Vite. Hugin stitching belongs in the separate worker container and must not block HTTP requests.

Create shared code before parallel feature work. Feature work belongs under `backend/app/routers/` or `frontend/src/features/<name>/`; do not edit shared app registration, the shared API client or package manifests from parallel feature tasks. Avoid modifying files outside the task's assigned paths.

Run checks separately from the repository root. The intended backend command is `docker compose --profile test run --rm backend-test python -m pytest backend/tests -q`; frontend checks are `npm --prefix frontend run test` and `npm --prefix frontend run build`. Mobile camera capture requires HTTPS. A failed panorama job must remain failed and show a recovery action; it must never be represented as stitched successfully.
