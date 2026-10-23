# TTKMap — Карта пространства

TTKMap is the TTK hackathon product for creating and exploring indoor space maps with POIs, panoramas and graph routes. The repository now contains the shared implementation foundation for autonomous backend and frontend agents.

## Start

The supported development environment is Docker Engine/Compose on Linux or Docker Desktop with WSL2 on Windows and macOS. From this directory:

```text
cp .env.example .env
docker compose build
docker compose run --rm api python -m backend.app.cli init-db
docker compose run --rm api python -m backend.app.cli create-organizer --email organizer@example.test
docker compose up api worker
```

For the frontend development server, install Node.js 22 and run `npm --prefix frontend ci`, then `npm --prefix frontend run dev`. Camera capture requires HTTPS on the phone.

## What is implemented in the foundation

- OpenAPI 3.0.3, shared TypeScript types and an executable SQLite schema in `CONTRACTS/`.
- FastAPI app factory, SQLite connection policy, health endpoint, organizer sessions and the initial map/document/public route APIs.
- React/Vite shell, shared API client, plan coordinate and panorama angle helpers.
- Docker image boundary for the eventual Hugin/enblend worker.
- Contract, schema and task-graph checks in `scripts/check_contracts.py`.

The full mandatory MVP is intentionally split into independent feature tasks. Read `TASKS/manifest.json` before taking a task and `AGENTS.md` plus `CONTRACTS/AGENTS.md` for ownership and contract rules. Do not reintroduce an Items CRUD example.

## Verification

Run each command separately from the repository root:

```text
docker compose --profile test run --rm backend-test python -m pytest backend/tests -q
npm --prefix frontend run test
npm --prefix frontend run build
docker compose --profile test run --rm backend-test python scripts/check_contracts.py
```

The local sandbox used to prepare this foundation did not have Docker, Node.js or Python dependencies installed, so those environment-dependent commands were not run here. SQLite execution, OpenAPI metadata parsing, JSON manifest validation and Python syntax compilation were checked locally.
