# C4: Hugin/enblend worker

Run as a separate process, sharing the API's database and media volume:

```text
python -m backend.worker.main
```

`DATABASE_PATH` and `MEDIA_PATH` must match the API. The process initializes an
empty database through the shared adapter; it never recreates an existing one.
Compose wiring belongs to the integration task.

## Queue, cancellation and recovery

Claims use C3's durable SQLite queue in a short `BEGIN IMMEDIATE` transaction.
A 120-second lease receives a heartbeat every 5 seconds from a separate thread,
including during native commands and image conversion. Every heartbeat,
progress update, failure and asset commit verifies the running state, token and
unexpired lease under the writer lock. An old worker cannot revive an expired
lease, overwrite a cancelled capture or commit after another worker reclaimed it.

Cancellation is detected within one heartbeat interval and stops the native
process group. SIGINT/SIGTERM stop new claims and cancel native work. Shutdown
leaves a recoverable running lease; C3 recovers it after expiry, enforcing two
attempts in total. A failed job remains failed until the explicit API retry.

Each attempt has one 900-second wall-clock deadline shared by all commands.
The subprocess runner uses argument arrays, bounded logs, process groups and
temporary files rather than shell commands or potentially blocking log pipes.
No database writer lock is held while running Hugin or encoding WebP.

## Pipeline and quality gates

Required executables: `pto_gen`, `cpfind`, `cpclean`, `autooptimiser`,
`pano_modify`, `pano_trafo`, `nona`, `enblend`.

1. Read exactly 16 sealed frame storage keys, reject missing files and duplicate
   normalized image bytes. Source paths must remain inside media storage.
2. Generate a rectilinear project using the capture's field-of-view hint.
3. Match all 120 image pairs with `--linearmatch --linearmatchlen=15`; this works
   on Hugin versions predating `--allpairs` too. The 15-to-0 seam is measured.
4. Prune pairwise outliers with `cpclean`, then optimize geometry, horizon and
   photometry. Require four distinct surviving control points for every adjacent
   pair, including the closing seam.
5. Use `pano_trafo` to project matched coordinates through Hugin's actual lens
   model to a 4096x2048 sphere. Require spherical RMS <=4 output pixels and p95
   <=8 pixels, with at least four <=8-pixel inliers on every ring edge. Spherical
   distances account for horizontal wrapping and latitude.
6. Render all 16 images with `nona`, blend with horizontal wrap and an explicit
   4096x2048 output canvas, and inspect the actual alpha mask. Select the largest
   contiguous vertical interval with opaque coverage at every longitude. Require
   >=40 degrees of vertical coverage and a supported horizon offset.
7. Crop that interval without stretching. Store measured `vaov_deg` and
   `v_offset_deg`, generate preview/mobile/full WebP variants through the shared
   media module, then atomically insert the asset and set `succeeded`.

Only measured success creates a ready asset. Error codes are the contract's
`INPUT_EXPIRED`, `NOT_ENOUGH_OVERLAP`, `LOOP_NOT_CLOSED`, `INSUFFICIENT_COVERAGE`,
`QUALITY_REJECTED`, `TIMEOUT`, `WORKER_LOST`, `TOOL_FAILED`.
Temporary attempt directories are removed on success, failure and cancellation;
uncommitted variant files are removed without deleting capture inputs. A hard
process/OS crash may leave unreferenced files; retention must coordinate with the
database and active attempts. Worker logs include successful coverage and RMS.

Hugin references: [cpfind matching strategies](https://hugin.sourceforge.io/docs/manual/Cpfind.html),
[autooptimiser](https://hugin.sourceforge.io/docs/manual/Autooptimiser.html),
[pano_trafo source and input format](https://hugin.sourceforge.io/docs/html/pano__trafo_8cpp_source.html).

## Verification and outstanding acceptance

Run from the repository root with Hugin/enblend available:

```text
docker compose --profile test run --rm backend-test python -m pytest backend/tests/stitch -q
```

The direct equivalent is `python -m pytest backend/tests/stitch -q` on Python
3.12 with backend requirements installed. Native test dependencies on Debian:
`apt-get install hugin-tools enblend` (already present in the backend Dockerfile).
The current GitHub backend workflow installs only Python packages; its owner
must also provide native tools before C4's required acceptance can pass. C4 is
not allowed to edit `.github/workflows/ci.yml`.

The test suite includes real child-process timeout/cancellation tests, lease
fencing and heartbeat tests, failure/rollback/variant cleanup tests, numerical
geometry and alpha-coverage tests, and a required real C1 fixture run alongside
API responsiveness measurements. Synthetic unit crops are labelled and are not
evidence of successful real-device stitching. Missing native tools or fixtures
fail the acceptance tests; they never cause a skip or a simulated success.

**Acceptance is currently incomplete.** The checked-in real `series_01` has not
produced an accepted panorama in local Hugin 2025.0.1/enblend 4.3 runs. Pairwise
matching/optimization produced `QUALITY_REJECTED` (RMS about 49px); matching all
pairs produced `LOOP_NOT_CLOSED` after outlier removal. The positive acceptance
test deliberately remains failing. Resolve the capture/alignment issue with
the C1 owner while preserving the quality gates, then rerun the full suite and
the container command before review/merge. Do not mark C4 complete based on unit
tests alone, and do not use this branch to claim full integration is ready.

Local tools were extracted from the official Hugin Windows MSI into a task
runtime outside this repository. MSI SHA256:
`ba40159130200568c09b8fbe329b631b9afaff7e5fbeae3dd2812333c46e9fca`.

Local verification on 2026-10-24 (base `ebe2915`, Windows/Python 3.12):

- C4 tests: 31 unit/process/lease checks passed; the negative native fixture check
  passed; the required positive native fixture check failed as described above.
- Full backend suite with native tools: **126 passed, 1 failed**.
- Contracts/schema/task graph and Python compilation: passed.
- Frontend regression suite: 66 passed. TypeScript and direct Vite build passed.
  The unchanged Windows npm build wrapper still exits 1 (`npx.cmd` / `EINVAL`).
- Docker is unavailable on this host; container/Linux verification is pending.
