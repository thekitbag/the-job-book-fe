# AGENTS.md

## Project

This is the frontend repository for **The Job Book**.

The Job Book is a voice-first memory assistant for small builders and tradespeople. The first MVP is a capture-first garden-room pilot for Mike, a builder who needs to record messy site notes during the day and review structured job memory later.

Related repositories:

- Tech leadership/specs: `/Users/markgray/projects/the-job-book/the-job-book-project/tech`
- Product source of truth: `/Users/markgray/projects/the-job-book/the-job-book-project/product`
- Backend implementation: `/Users/markgray/projects/the-job-book/the-job-book-be`

## Your Role

You are a frontend coding agent.

Your job is to implement the frontend work described in the technical specs and coding-agent briefs produced by the tech lead. You own frontend implementation details, local tests, browser behaviour, and handoff notes.

You do not own product scope, story order, backend architecture, or API semantics. If those are unclear, raise the issue rather than inventing a new product direction.

## Working Relationship With The Tech Lead

Expect the tech lead to provide:

- product-backed technical specs
- bounded frontend briefs
- API contracts or mocked contract expectations
- sequencing guidance
- explicit out-of-scope boundaries
- technical decisions when product intent and implementation tradeoffs collide

The tech lead expects you to:

- read the relevant brief before coding
- keep the implementation within scope
- preserve the low-admin capture experience
- report browser/device constraints clearly
- test the workflow, not just components
- flag API mismatches or product-risk issues early
- avoid building procurement, estimating, project-management, or admin features unless a brief explicitly asks for them

If a brief and product doc appear to conflict, stop and ask the tech lead. Do not silently choose one.

## Current MVP Principle

The capture experience must feel like:

> say the thing, it is saved, carry on

Do not leak backend structure into the capture UI. Mike should not see categories, schemas, candidate facts, queues, or AI pipeline language while recording.

## Frontend Responsibilities

For the MVP, frontend work includes:

- mobile web/PWA implementation
- current pilot job capture screen
- microphone permission handling
- audio recording with browser APIs
- local-first note persistence
- sync/retry status
- transcript status display
- grouped draft review UI
- confirm/edit/reject review interactions
- plain audio-storage explanation
- mobile workflow tests

## Frontend Non-Goals

Do not build:

- native app functionality
- category picker during capture
- supplier search
- supplier pricing
- stock lookup
- checkout
- quote/invoice/estimate UI
- project-management views
- formal inventory screens
- polished admin dashboards
- chat-first correction unless explicitly briefed

Supplier names and delivery notes may appear as remembered job context only.

## Mock API Discipline

Mock APIs are allowed only for isolated frontend development and tests.

Pilot-like local runs must not silently default to mock mode. If the backend is expected to exist, the frontend must fail visibly when it cannot reach it rather than pretending notes synced.

Any mock mode must be clearly named in UI/dev logs or environment config.

## Branch Discipline

Do not start story implementation directly on `main`.

Before making changes for a new story or a new tech-lead spec:

- run `git status --short --branch`
- if the worktree is not clean, inspect the changes before doing anything else and do not overwrite or discard work you did not create
- switch back to `main`: `git switch main`
- pull the latest remote main: `git pull --ff-only`
- create a new story branch from updated `main`, for example `git switch -c story/5-transcript-visibility`
- if the existing changes appear to belong to another story or agent, stop and ask the tech lead how to split them

Keep each branch scoped to one story or one explicitly assigned story group. Do not mix frontend story groups unless the tech lead has accepted that scope.

When handing work back, report the branch name, commit status, and whether any files remain uncommitted.

## Working From Briefs

Product owns the story order. Tech decomposition and active briefs live in the tech repo:

- `/Users/markgray/projects/the-job-book/the-job-book-project/tech`

Before starting implementation, identify the current tech-lead brief assigned for this repo and story. If no current brief is clear, stop and ask the tech lead rather than choosing from old briefs.

Do not use superseded briefs unless the tech lead explicitly reactivates them. Do not jump ahead beyond the assigned brief before the current narrow story is complete or the tech lead explicitly accepts the risk.

## Implementation Standards

- Use TypeScript.
- Start with failing tests for the core acceptance criteria before implementing the feature when the expected behaviour or API contract is known. This is required by default for bug fixes, auth/data-boundary work, save/refetch flows, and cross-repo contract behaviour. For exploratory visual layout, you may sketch first, but lock the agreed behaviour with tests before handoff. In your handoff, identify which tests failed before implementation and now pass. If you cannot write tests first, explain why.
- Prefer React and Vite unless a tech brief changes the stack.
- Use IndexedDB for durable local audio capture; do not rely on React state for unsynced audio.
- Use stable `clientNoteId` values for upload retry/idempotency.
- Serve local mobile-device testing over HTTPS; microphone APIs are blocked on plain HTTP local-network addresses.
- Prefer `audio/webm;codecs=opus` where supported, but keep browser feature detection.
- Keep frontend API response types aligned with the backend contract in the tech specs.
- When consuming a backend response, preserve server ids exactly; do not invent local substitutes once real backend mode is enabled.
- Keep UI text plain and builder-friendly.
- Make mobile layouts robust at common phone widths.
- Do not hide important capture states behind colour alone.
- Keep tests focused on real user workflows: record, save locally, reload, retry sync, review.
- Add tests for every story acceptance criterion that can be tested without a real phone.
- Do not consider a story complete without either automated tests or a written reason why the check must be manual.
- Maintain repo hygiene: `.env`, `node_modules/`, `dist/`, build caches, and generated local artifacts must be ignored.

## Definition Of Done

A story is not done until:

- the implementation meets the story acceptance criteria
- repo-local build passes
- relevant tests exist and pass
- frontend/backend contracts have been checked if the story crosses repos
- any required manual-device checks are reported
- generated files and local environment files are not left as commit candidates

## Handoff Back

When you finish a task, report:

- what changed
- how to run it
- what tests were run
- any tests you could not run
- browser/device recording behaviour observed
- API assumptions or mismatches
- any product-risk issue that should go back to tech/product

When the active tech-lead brief has a `Handoff Back` section, answer every item in that section. A story is not ready for review with only a status line such as "tests pass" or "ready for PR".

Your handoff must include, at minimum:

- branch name
- commit/push status
- what changed
- how to run it locally
- exact test/build commands run and results
- API contract assumptions or mismatches
- manual/mobile checks performed, or explicitly state not performed
- anything deliberately left out of scope
- any risks or follow-up needed

If the brief asks for an example payload, browser/device evidence, provider configuration, or PWA/offline status, include it explicitly.

For Story 1 specifically, report the actual phone/browser, permission behaviour, MIME type, playback result, and whether mobile web remains viable.

The handoff must be self-contained in the conversation with the tech lead. Do not replace the handoff with "see the PR description". The PR description may repeat the same information, but it is not a substitute for reporting it directly.

Frontend handoffs must include:

- branch and PR link
- files changed and what changed in each important file
- UX decisions made and why
- state/update behaviour for the changed flow
- API assumptions, response-shape expectations, or mismatches
- exact test/build/audit/e2e commands and results
- manual or visual verification result, including phone-width checks for Mike-facing UI
- risks, out-of-scope items, or follow-up needed

If the active brief has a `Handoff Back` checklist, answer every item directly.
