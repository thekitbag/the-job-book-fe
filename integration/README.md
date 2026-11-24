# Real-backend UI checks

These tests drive Chromium through the frontend UI against a checkout of the
backend's `release/job-memory`. They do not intercept `/api` requests. The
backend application, authentication, database queries, filing, draft decisions,
job memory, and moves are real. The harness injects deterministic transcription
and extraction providers and local disk storage; it does not call OpenAI or R2.

The recorded verification used backend commit `4ec49f3` (PR #60), an isolated
local PostgreSQL database, and frontend base `11eb58c` (PR #83).

## Run

1. Prepare a separate backend checkout of `release/job-memory`, install its
   dependencies, and configure its `.env.test` to use a **disposable local test
   database**. Run its Prisma migrations against that database. Never use a
   production database: the fixture controls can create review decisions.
2. From that backend checkout, start the harness (substitute your paths):

   ```sh
   JOB_BOOK_BACKEND_ROOT="$PWD" npx tsx /path/to/the-job-book-fe/integration/serve-backend.mts
   ```

3. From this frontend checkout:

   ```sh
   npm ci
   npx playwright install chromium
   npx playwright test --config playwright.real.config.ts
   ```

The harness listens on `127.0.0.1:3002`. Playwright starts the real-API frontend
on `https://localhost:5177`, proxying `/api` and explicit `/__test` fixture controls
to that backend. Its output directory is `integration-results/`. Screenshots are
written to `docs/verification/record-from-home/` and reviewed at phone width.
Stop the harness and discard the test database and `/tmp/record-home-ui-audio`
after use. `/__test` controls are in this harness only, never the shipping app.

For ordinary mock development, opt in explicitly with
`VITE_USE_MOCK_API=true npm run dev -- --port 5174`. The standard Playwright suite
uses named mock/HTTP-fixture configurations and is separate from this integration
suite. The default application API mode remains real.

## Evidence and limits

The suite covers Home capture, Later and New job, draft values and uncertainty,
`moreToCheckCount`, exact Looks right ids, `DRAFT_CHANGED`, Fix, silent recordings,
photo filing and moves, canonical upload destinations, offline archived jobs,
idempotent photo conflict recovery, remote-only photo conflicts, offline photo
persistence, stable picker ordering during refresh, shared-phone ownership, and
refused moves. The standard browser suite additionally exercises a built PWA's
offline close/new-page recovery and choosing a job during an in-flight upload.

Chromium uses a fake microphone over HTTPS. This does not establish physical
microphone permission behavior, Safari codec behavior, installed iPhone PWA cold
launch/update/resume, phone lock during recording, or physical offline capture.
Those iPhone checks remain required before release. No production-schema copy,
live transcription provider, cloud object storage, playback, or blob-retention
change was verified or introduced here.
