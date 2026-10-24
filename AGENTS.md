# TTKMap contributor boundaries

The project implements the TTK «Карта пространства» case. The mandatory MVP is defined by `specification.md` and `docs/reference_raw.md`; offline maps, multiple floors, analytics, automatic plan recognition, multiple buildings and full 3D reconstruction are backlog.

Read `CONTRACTS/AGENTS.md` before implementation and `TASKS/WORKPLAN.md` before taking a task. Use one short-lived branch and PR per task; do not work directly on `main`. Mark the task complete in the workplan and `TASKS/manifest.json` only after its PR is merged. The workplan is the human-readable assignment board; keep its task IDs, dependencies and allowed paths synchronized with `manifest.json`, which is validated by repository checks. Keep edits within the assigned paths. Do not add a generic Items CRUD example. Do not publish repository changes or interact with VibeTeamOS Hub unless explicitly asked.

## Safe parallel Git workflow

- Use a separate clone or `git worktree` per person. Never switch branches in a shared checkout and never edit another agent's worktree.
- Before starting, run `git status --short`, update from `main` with `git pull --ff-only origin main`, and create one branch named `task/<task-id>`.
- Keep one PR per task ID. Put the exact task ID in the PR title, for example `ttk-plan-editor: support movable POIs`.
- Commit only files in that task's `allowed_paths`. Do not use `git reset --hard`, `git checkout --`, or ordinary `git push --force` to repair a branch.
- Push early and open a Draft PR. Before requesting review, run the task's `verify_cmd`, `git diff --check`, and the checks listed in `.github/workflows/ci.yml`; paste the results into the PR.
- A second teammate reviews the diff, test evidence, task scope, dependency order, and negative cases. The author resolves all review comments and updates the same PR.
- If `main` advanced, update the task branch with `git fetch origin` and `git rebase origin/main` (or a regular merge if the branch is shared). Resolve conflicts in the task branch, rerun checks, and use `git push --force-with-lease` only on that personal branch.
- Never resolve a conflict with a blind `ours`/`theirs` choice. Preserve both intended changes and ask the owner of the overlapping file when ownership is unclear.
- Merge only after GitHub checks are green and a teammate has approved. Delete the branch after merge, then mark the task complete in `TASKS/WORKPLAN.md` and `TASKS/manifest.json` on `main`.

`CONTRACTS/openapi.yaml` is the API source of truth. `CONTRACTS/types.ts` is the shared TypeScript DTO module. A contract change must be coordinated before backend/frontend changes. Identifiers are UUIDv4; plan coordinates are local units (top-left origin, X right, Y down); panorama angles are degrees. All API errors use the documented envelope.

The backend uses Python 3.12/FastAPI/SQLite. Each connection enables foreign keys, WAL and a busy timeout. SQLite schema initialization is for an empty database only; never delete or recreate an existing database to make tests pass. The frontend uses React/TypeScript/Vite. Hugin stitching belongs in the separate worker container and must not block HTTP requests.

Create shared code before parallel feature work. Feature work belongs under `backend/app/routers/` or `frontend/src/features/<name>/`; do not edit shared app registration, the shared API client or package manifests from parallel feature tasks. Avoid modifying files outside the task's assigned paths.

Run checks separately from the repository root. The intended backend command is `docker compose --profile test run --rm backend-test python -m pytest backend/tests -q`; frontend checks are `npm --prefix frontend run test` and `npm --prefix frontend run build`. Mobile camera capture requires HTTPS. A failed panorama job must remain failed and show a recovery action; it must never be represented as stitched successfully.
