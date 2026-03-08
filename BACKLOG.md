# Backlog

This document is the AI-facing execution board for the project. It is optimized for coding agents and humans working through small, verifiable tasks while removing friction from the supported player path.

If this file and [ROADMAP.md](/g:/text-game/ROADMAP.md) disagree, the roadmap wins on product scope and phase order. If this file and implementation disagree, update this file before starting new work.

TypeScript source is authoritative in this repo: server code lives under `src/*.ts`, browser source lives at `public/app.ts`, and `public/app.js` is an emitted asset rather than an authoring surface.

## How Agents Must Use This File

1. Read [ROADMAP.md](/g:/text-game/ROADMAP.md), this file, and [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md) before starting substantial work.
2. Choose work from `## Ready Queue` unless the user explicitly assigns a different task.
3. Within the current phase, bias toward the task that removes the most player friction, especially terminal use, manual config editing, and startup ambiguity.
4. Claim exactly one task card by changing its `Status` from `Ready` to `In Progress`.
5. Do only the work described in that task card unless a blocking dependency forces a documented expansion.
6. Run the listed validation commands before marking the task complete.
7. Update the task card, the queue table, and any affected docs before ending the session.
8. If blocked, change the task to `Blocked` and add a one-line blocker note.

## Status Model

- `Ready`: fully specified and safe for an agent to start
- `In Progress`: currently being worked by one agent
- `Blocked`: cannot proceed because a dependency, decision, or missing context prevents safe execution
- `Review`: implementation is done and awaits human or follow-up agent review
- `Done`: validated and fully handed off
- `Dropped`: intentionally removed from scope

## Queue Model

- `Now`: should be worked in the current phase
- `Next`: can be prepared now but should not be started until `Now` work is stable
- `Later`: intentionally deferred

## End-User-First Priority Rules

- Prefer tasks that remove terminal usage, manual `.env` editing, browser URL hunting, or hidden service management from the supported player path.
- When two tasks are otherwise similar, choose the one that makes clean-machine Windows playtesting easier.
- A task is not end-user complete if only a developer can diagnose or recover from failure.
- Browser-only convenience work does not outrank launcher, setup, save or load, or first-run clarity work while the supported player path is still rough.

## Agent Task Card Template

Use this exact shape when adding new work:

```md
### T00 - Short Task Name

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: One-sentence description of the outcome.
- Scope:
  - concrete deliverable 1
  - concrete deliverable 2
- Files to Touch:
  - path/to/file
  - path/to/other-file
- Do Not Touch:
  - path/to/protected-area
- Dependencies:
  - T00a
- Validation:
  - npm test
  - npm run lint
- Definition of Done:
  - observable completion condition 1
  - observable completion condition 2
- Handoff Notes:
  - what the next agent should know
```

## Ready Queue

| ID | Queue | Phase | Priority | Task | Status | Depends On | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Now | P0 | P1 | Player launch bootstrap path | Review | None | `docker compose up --build`; `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1` |
| T41 | Now | P0 | P1 | Full TypeScript migration | Done | None | `npm run type-check`; `npm test`; `docker compose up --build`; `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1` |
| T01a | Now | P0 | P1 | Runtime preflight and recovery messaging | Review | T01, T02 | Manual launcher failure checks |
| T35 | Now | P0 | P1 | Packaging prototype and decision memo | Ready | T01 | Prototype build verification |
| T02 | Now | P0 | P1 | Config module with schema validation | Review | None | `npm test` |
| T02a | Now | P0 | P1 | LiteLLM env contract and alias defaults | Ready | T02 | Manual config verification |
| T02b | Now | P0 | P1 | LiteLLM proxy template and startup docs | Ready | T02a | Manual LiteLLM startup verification |
| T02c | Now | P0 | P2 | Windows local AI smoke-test path | Review | T02 | Manual local provider startup verification |
| T02d | Now | P0 | P2 | Local AI workflow regression harness | Done | T02c | `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` |
| T02e | Now | P0 | P1 | AI test-first workflow policy | Done | T02d | Manual doc consistency review |
| T03 | Now | P0 | P1 | Logging with levels and redaction | Ready | None | `npm test` |
| T04 | Now | P0 | P1 | DB migrations and seed flow | Ready | None | Manual DB reset verification |
| T05 | Next | P0 | P2 | Error boundary and global handler | Ready | None | `npm test` |
| T06 | Next | P1 | P1 | Turn input, output, and state schemas | Ready | T02 | `npm test` |
| T07 | Next | P1 | P1 | Turn handler and model orchestration | Ready | T06 | `npm test` |
| T07a | Next | P1 | P1 | LiteLLM default chat route for turn generation | Ready | T02b, T07 | Manual turn submission against LiteLLM |
| T08 | Next | P1 | P1 | Deterministic state reducer | Ready | T06 | `npm test` |
| T09 | Next | P1 | P1 | Event log persistence and replay | Ready | T04, T08 | Replay fixture execution |
| T10 | Next | P1 | P1 | Output validator and sanitizer | Ready | T06 | `npm test` |
| T11 | Next | P1 | P1 | Minimal player UI loop | Review | T06 | Manual browser smoke test |
| T12 | Next | P1 | P1 | New game onboarding | Ready | T06 | Manual new-game flow check |
| T12b | Next | P1 | P1 | First-run setup wizard and connection test | Ready | T02, T11, T12 | Manual first-run flow check |
| T29 | Next | P1 | P1 | Save slots UI | Ready | T08, T09 | Manual save/load check |
| T34 | Next | P1 | P1 | Tutorial and first-run guidance | Ready | T11, T12 | Manual onboarding smoke test |
| T12a | Later | P1 | P3 | Rate limiting and abuse guard | Ready | T07 | `npm test` |
| T13 | Later | P2 | P1 | Embeddings pipeline | Ready | T07a | Manual embedding call verification |
| T13a | Later | P2 | P1 | LiteLLM embedding alias integration | Ready | T02b | Manual embedding route verification |
| T14 | Later | P2 | P1 | Retrieval and top-k ranking | Ready | T13, T13a | Retrieval fixture check |
| T15 | Later | P2 | P1 | Memory summarizer job | Ready | T09 | `npm test` |
| T16 | Later | P2 | P1 | Director spec format and versioning | Ready | T06, D02 | Schema validation check |
| T17 | Later | P2 | P1 | Director enforcement in turn pipeline | Ready | T16 | Integration test |
| T18 | Later | P2 | P2 | Director reload endpoint | Ready | T16 | Manual reload verification |
| T30 | Later | P2 | P2 | Save import and export | Ready | T29 | Import/export compatibility check |
| T31 | Later | P3 | P2 | Optional save encryption | Ready | T29 | Encryption or decryption smoke test |
| T32 | Later | P3 | P1 | Accessibility pass | Ready | T11, T34 | Accessibility checklist |
| T33 | Later | P3 | P2 | Theme and typography pass | Ready | T11 | Manual readability review |
| T36 | Later | P3 | P1 | Windows playtest build | Ready | T35, T12b, T29 | Build or install verification |
| T38 | Later | P3 | P1 | Installer packaging | Ready | T36 | Installer smoke test |
| T19 | Later | P4 | P1 | Quest schema and validation | Ready | T16 | Schema validation check |
| T20 | Later | P4 | P1 | Quest state transitions | Ready | T19 | `npm test` |
| T21 | Later | P4 | P2 | Quest editor UI | Ready | T19 | Manual editor smoke test |
| T22 | Later | P4 | P2 | World state inspector UI | Ready | T20 | Manual diff view check |
| T23 | Later | P4 | P2 | Quest import and export | Ready | T19 | Import or export smoke test |
| T24 | Later | P4 | P1 | Core pipeline tests | Ready | T07, T08, T10 | CI-equivalent test run |
| T25 | Later | P4 | P1 | Fuzz tests for validator | Ready | T10 | Fuzz test run |
| T26 | Later | P4 | P1 | Telemetry for tokens, latency, and cost | Ready | T07 | Manual telemetry verification |
| T27 | Later | P4 | P2 | Audit log export | Ready | T09 | Export smoke test |
| T28 | Later | P4 | P2 | Model failure fallback | Ready | T07, T10 | Timeout or failure simulation |
| T36a | Later | P5 | P2 | macOS feasibility check | Ready | T35 | Feasibility note |
| T37 | Later | P5 | P2 | Auto-update channel | Ready | T38 | Update flow verification |
| T39 | Later | P5 | P3 | Linux build | Ready | T35 | Build verification if supported |
| T40 | Later | P5 | P1 | Release checklist | Ready | T36, T38 | Checklist walkthrough |

## Active Task Protocol

When an agent starts work, it must:

1. Pick one `Ready` task.
2. Change its status in the queue table to `In Progress`.
3. Add or update the detailed task card for that task.
4. Keep scope inside the `Files to Touch` list unless the dependency chain forces a change.
5. Finish by moving the task to `Review` or `Done`, with validation and handoff notes recorded.

When a human assigns a task directly, the assigned task overrides queue order.

### T41 - Full TypeScript Migration

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Move the codebase from JavaScript source to TypeScript source without changing runtime behavior or the provider-neutral game contract.
- Scope:
  - migrate server, config, gameplay, AI, validation, DB, and browser source to TypeScript
  - align local dev on direct TypeScript execution while keeping Docker and launcher paths on compiled server output
  - update npm scripts, compiler config, Docker runtime wiring, and emitted browser asset flow
  - update the backlog and repo docs to reflect the new validation and file-path reality
- Files to Touch:
  - .dockerignore
  - .gitignore
  - package.json
  - tsconfig.json
  - tsconfig.server.json
  - Dockerfile
  - docker-compose.yml
  - README.md
  - AGENTS.md
  - BACKLOG.md
  - ENGINEERING_STANDARDS.md
  - ARCHITECTURE.md
  - AI_CONTROL.md
  - ROADMAP.md
  - setup_local_a.i.md
  - public/app.ts
  - public/index.html
  - src/
- Do Not Touch:
  - data/spec/
- Dependencies:
  - None
- Validation:
  - `npm run type-check` or `docker compose run --rm app npm run type-check`
  - `npm test` or `docker compose run --rm app npm test`
  - `docker compose up --build`
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`
- Definition of Done:
  - TypeScript source fully replaces the previous JavaScript source in `src/`
  - browser source is maintained in TypeScript while the browser continues to load a JS asset
  - Docker and launcher flows run the compiled server output instead of the source tree
  - validation and contributor docs reflect the new TypeScript workflow
  - runtime behavior remains provider-neutral and server-authoritative
- Handoff Notes:
  - user explicitly assigned the migration on 2026-03-08, overriding queue order
  - removed the legacy `.js` source twins from `src/`; TypeScript is now the only authoring surface for app code
  - Docker now builds the browser asset plus compiled server output during image build, then runs `dist/server.js`
  - added `.dockerignore` so Docker builds from TypeScript source instead of shipping host build artifacts back into the image
  - updated repo governance and task cards so future work points at `src/*.ts` and `public/app.ts` instead of deleted `.js` source files
  - validated on 2026-03-08 with `docker compose run --rm app npm run type-check`, `docker compose run --rm app npm test`, `docker compose up --build -d` with host verification on `PORT=3300`, `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`, and `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`
  - this machine still has an unrelated `wslrelay` listener on host port `3000`; the raw Docker smoke used `PORT=3300` and the launcher correctly auto-fell back to `3100`

## Detailed Task Cards

### T01 - Player Launch Bootstrap Path

- Status: Review
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make startup reproducible through one obvious launch path for both developers and future end users.
- Scope:
  - define a one-command local dev startup path
  - add a Docker-based cross-platform startup path that keeps Node/npm and native builds inside containers
  - add a Windows launcher that checks prerequisites, verifies the configured AI path, starts the app server, and opens the player surface
  - document the expected local prerequisites and supported launch limitations
  - ensure the startup path matches the README and can seed later packaged builds
- Files to Touch:
  - package.json
  - README.md
  - .env.example
  - BACKLOG.md
  - scripts/start-dev.ps1
  - Dockerfile
  - docker-compose.yml
  - .dockerignore
- Do Not Touch:
  - src/
  - public/
- Dependencies:
  - None
- Validation:
  - `docker compose up --build`
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`
- Definition of Done:
  - one documented Docker command starts the app locally across supported desktop platforms
  - the Windows launcher checks the expected local prerequisites, opens the app automatically, and surfaces actionable failures
  - required environment variables are documented
  - setup instructions match the current repository
  - launcher behavior is suitable as the basis for later packaged builds
- Handoff Notes:
  - user assigned the Windows startup script directly on 2026-03-07
  - added Docker-first dev startup with `Dockerfile`, `docker-compose.yml`, and `.dockerignore`
  - updated `scripts/start-dev.ps1` to launch the Docker path instead of requiring host Node/npm
  - kept `npm run dev:windows` as a convenience wrapper for the Windows launcher when local npm exists
  - README now includes a cross-platform Node.js and npm install guide for Windows, macOS, and Linux
  - the launcher now checks Docker, probes the configured AI path, translates local host AI URLs to Docker-reachable URLs when needed, starts the app container, waits for readiness, and opens the browser
  - this task is now treated as the seed of the supported player launch path, not only a developer convenience script
  - fixed a Docker-on-Windows bind-mount failure from the `G:` workspace by baking app source into the image and persisting only `game.db` through a named Docker volume
  - tightened launcher readiness so it now waits for container health and verifies the actual player surface instead of accepting any HTTP responder on port 3000
  - fixed a Windows port-release race after `docker compose down`; the launcher now waits briefly for Docker or WSL listeners to release the configured port before failing
  - the launcher now auto-selects a nearby free port for the current run when the configured host port is already occupied by another local service
  - updated the startup docs so `PORT` overrides are explicit for machines where `3000` is already occupied
  - validation completed on 2026-03-08 with `docker compose up --build` equivalent via `docker compose up --build -d` plus host API verification, and `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` with `PORT=3300`
  - default `PORT=3000` on this machine is occupied by an unrelated local `wslrelay` listener that returns an nginx 404, so the launcher's port-conflict guidance was exercised and the successful runtime validation used a session `PORT` override
  - revalidated on 2026-03-08 with `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` and no manual `PORT` override; the launcher detected the `3000` conflict, selected `3100`, and the app API responded successfully on the fallback port

### T01a - Runtime Preflight And Recovery Messaging

- Status: Review
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Explain missing config and unreachable AI dependencies in plain language before gameplay starts.
- Scope:
  - detect missing env values, unreachable AI endpoints, and common model alias mistakes during startup
  - expose safe diagnostic state to the launcher or player UI
  - render actionable recovery messages instead of raw stack traces
  - cover the common first-run failures for the supported Windows launch path
- Files to Touch:
  - BACKLOG.md
  - README.md
  - public/index.html
  - public/app.ts
  - src/config.ts
  - src/config.test.ts
  - src/server.ts
- Do Not Touch:
  - data/spec/
  - src/game.ts
- Dependencies:
  - T01
  - T02
- Validation:
  - `npm test`
  - manual launcher failure checks with missing and unreachable AI config
- Definition of Done:
  - first-run failures present recovery steps without requiring developer knowledge
  - diagnostics omit secrets while still distinguishing the common failure modes
  - launcher and browser surfaces agree on the same recovery guidance
- Handoff Notes:
  - keep player-facing wording plain and avoid implementation jargon unless it helps support reproduce the issue
  - the server no longer exits immediately on config validation failure; `/api/state` now returns safe runtime preflight status and the browser blocks the first turn with recovery guidance instead
  - startup preflight now distinguishes config errors, credential rejection, unreachable AI URLs, and model-alias mismatches returned by `/models`
  - the browser play surface now renders a setup panel and disables turn submission while startup preflight is blocked
  - launcher validation on 2026-03-08 covered two cases: missing `AI_API_KEY` with `AI_PROVIDER=openai-compatible` now surfaces browser preflight guidance at `/api/state`, and unreachable `LITELLM_PROXY_URL=http://127.0.0.1:4011` still fails fast in `scripts/start-dev.ps1`
  - validated on 2026-03-08 with `docker compose build app`, `docker compose run --rm app npm run type-check`, `docker compose run --rm app npm test`, and a focused `docker run --rm text-game-app sh -lc 'npm exec tsx -- --test src/config.test.ts'` check because the current Docker-shell `npm test` output still reports only the older test count even after the new test is present in the built image
  - refreshed emitted `public/app.js` from the rebuilt Docker image because local `npm` is not installed in this shell environment

### T35 - Packaging Prototype And Decision Memo

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Release lead
- Goal: Choose the earliest packaging path that preserves one gameplay stack and supports clean-machine playtests.
- Scope:
  - compare browser-launcher-only, Tauri, and Electron against the current runtime needs
  - build one thin prototype of the leading option
  - document startup, save-path, logging, and AI-config implications
  - define a clean-machine Windows smoke checklist for the chosen direction
- Files to Touch:
  - ARCHITECTURE.md
  - BACKLOG.md
  - README.md
  - ROADMAP.md
  - package.json
  - scripts/
  - packaging/
- Do Not Touch:
  - data/spec/
  - src/game.ts
- Dependencies:
  - T01
- Validation:
  - prototype build verification
  - clean-machine launch smoke checklist dry run
- Definition of Done:
  - one packaging direction has a clear rationale
  - the prototype proves the local server and UI can be launched from one obvious player action
  - save, log, and config implications are documented for follow-on tasks
  - open blockers are written down clearly enough for T36 and T38
- Handoff Notes:
  - keep the gameplay stack shared with the browser dev path
  - if the launcher-only path is enough for the next milestone, record why and what would force a wrapper later

### T02 - Config Module With Schema Validation

- Status: In Progress
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Centralize runtime configuration and fail early on invalid environment state.
- Scope:
  - define the configuration surface used by the app
  - validate required environment variables at startup
  - expose normalized config values to callers and startup preflight flows
- Files to Touch:
  - package.json
  - src/config.ts
  - src/config.test.ts
  - src/server.ts
  - README.md
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - None
- Validation:
  - `npm test`
  - manual startup with valid and invalid env values
- Definition of Done:
  - missing required config fails clearly at startup
  - config parsing logic is centralized in one module
  - launcher and UI preflight code can reuse normalized config without duplicating parsing rules
  - docs reflect the actual config contract
- Handoff Notes:
  - user assigned this task directly on 2026-03-08
  - note any env vars intentionally left provisional for LiteLLM integration

### T03 - Logging With Levels And Redaction

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Platform lead
- Goal: Provide consistent logs that are useful for debugging without leaking secrets.
- Scope:
  - add log levels
  - redact secrets and sensitive request fields
  - make log usage consistent in the server path
  - keep startup and recovery logs understandable during launcher troubleshooting
- Files to Touch:
  - src/server.ts
  - src/config.ts
  - README.md
- Do Not Touch:
  - public/
- Dependencies:
  - None
- Validation:
  - `npm test`
  - manual request smoke test with logs enabled
- Definition of Done:
  - logs include level and message context
  - known sensitive values are not printed plainly
  - logging behavior is documented enough for local debugging and startup failure triage
- Handoff Notes:
  - note any remaining unstructured logs for later cleanup

### T04 - DB Migrations And Seed Flow

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Replace ad hoc database setup with repeatable initialization and reset flows.
- Scope:
  - define the initial migration path
  - define a seed or reset workflow
  - document the workflow for local development and launched app recovery
- Files to Touch:
  - src/db.ts
  - package.json
  - README.md
- Do Not Touch:
  - public/
- Dependencies:
  - None
- Validation:
  - database reset and restart smoke test
- Definition of Done:
  - a developer can create and reset the database repeatably
  - schema creation is not hidden in incidental app startup logic only
  - local docs describe the reset path
- Handoff Notes:
  - note any schema assumptions that later migrations must preserve

### T06 - Turn Input, Output, And State Schemas

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Backend lead
- Goal: Define versioned schema boundaries for the core gameplay loop.
- Scope:
  - define turn input shape
  - define structured model output shape
  - define authoritative state shape and version marker
- Files to Touch:
  - src/validator.ts
  - src/server.ts
  - REQUIREMENTS.md
- Do Not Touch:
  - public/styles.css
  - packaging docs
- Dependencies:
  - T02
- Validation:
  - `npm test`
- Definition of Done:
  - schemas are explicit and versioned
  - invalid payloads are rejected
  - the schema contract is documented for future AI tasks
- Handoff Notes:
  - record schema version names and any intentionally deferred fields

### T11 - Minimal Player UI Loop

- Status: Review
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Provide a text-first browser UI that can serve as the player surface for both the dev loop and the future launched build.
- Scope:
  - keep a text-first browser play loop for player input and narrator output
  - add session controls that are clear without developer context
  - add a debug surface for session, model, timing, and turn payload inspection without overwhelming normal play
  - keep the implementation aligned with the existing server endpoints instead of creating a parallel UI contract
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - public/index.html
  - public/app.ts
  - public/styles.css
  - src/server.ts
- Do Not Touch:
  - data/spec/
  - src/ai.ts
  - src/assist.ts
  - src/db.ts
- Dependencies:
  - T06
- Validation:
  - `npm install`
  - `npm run dev`
  - manual browser smoke test against the configured local AI path
- Definition of Done:
  - a player can create or resume a session in the browser and submit turns
  - narrator output, suggested options, and current state are visible without opening devtools
  - useful debug details are available when needed without exposing secrets
  - the same UI can be reused by the launcher or packaged path
- Handoff Notes:
  - user assigned this ahead of queue order on 2026-03-07 to make local AI iteration easier before deeper roadmap work
  - implemented a browser play shell with session refresh or new-session controls, multiline text input, suggestion chips, and a persistent debug panel
  - `/api/state` now returns safe runtime or session debug data and `/api/turn` now returns safe debug data including request id, latency, prompt preview, embedding fallback status, validation result, and before or after player snapshots
  - local validation was limited to code inspection plus `git diff --check`; `npm install`, `npm run dev`, and the manual browser smoke test were not runnable because `node` and `npm` were unavailable in this shell environment

### T12 - New Game Onboarding

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Get a first-time player from launch to the first turn with minimal explanation debt.
- Scope:
  - capture only the information needed to start or resume play
  - make new game and resume controls obvious from the first screen
  - explain the basic turn loop in plain language without requiring README reading
- Files to Touch:
  - BACKLOG.md
  - README.md
  - public/index.html
  - public/app.ts
  - public/styles.css
- Do Not Touch:
  - src/ai.ts
  - src/db.ts
- Dependencies:
  - T06
- Validation:
  - manual new-game flow check
- Definition of Done:
  - a first-time player can start or resume without needing external docs mid-session
  - onboarding copy avoids developer jargon
  - the onboarding flow hands off cleanly to the tutorial and setup diagnostics paths
- Handoff Notes:
  - keep the first screen short enough that it still feels like an app launch, not a configuration checklist

### T12b - First-Run Setup Wizard And Connection Test

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Turn configuration and AI connectivity into a guided first-run flow instead of README-only work.
- Scope:
  - add guided checks for the supported AI provider and config before the first turn
  - expose a safe connection test and plain-language error states
  - allow retrying setup without deleting saves or reopening the terminal
  - document the supported MVP AI path in the UI and README
- Files to Touch:
  - BACKLOG.md
  - README.md
  - public/index.html
  - public/app.ts
  - public/styles.css
  - src/config.ts
  - src/server.ts
- Do Not Touch:
  - data/spec/
  - src/game.ts
- Dependencies:
  - T02
  - T11
  - T12
- Validation:
  - `npm test`
  - manual first-run flow check with reachable and unreachable AI paths
- Definition of Done:
  - the setup flow can confirm or clearly reject the current AI config
  - a user can fix config and retry without deciphering stack traces
  - diagnostics omit secrets while still giving enough support context
  - the setup flow matches launcher behavior and README guidance
- Handoff Notes:
  - treat the supported AI path as a product decision, not just a config screen

### T29 - Save Slots UI

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Make session continuity visible and safe from the main player flow.
- Scope:
  - list available save slots in the main UI
  - create, update, and load slots without file browsing or terminal use
  - show compatibility or corruption problems in plain language
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - public/index.html
  - public/app.ts
  - public/styles.css
  - src/db.ts
  - src/server.ts
- Do Not Touch:
  - data/spec/
  - src/ai.ts
- Dependencies:
  - T08
  - T09
- Validation:
  - manual save or load check
- Definition of Done:
  - save slots are accessible from the main UI
  - save and load errors are actionable for non-developers
  - the supported player path can save and resume without manual file handling
- Handoff Notes:
  - keep slot naming and recovery wording plain because packaged builds will amplify confusion here

### T34 - Tutorial And First-Run Guidance

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Explain the core loop and controls inside the app so the README is optional for first-time play.
- Scope:
  - add short tutorial beats for the first session
  - explain suggested inputs, session controls, and recovery actions in plain language
  - ensure tutorial copy degrades cleanly once the player is familiar
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - public/index.html
  - public/app.ts
  - public/styles.css
- Do Not Touch:
  - data/spec/
  - src/ai.ts
  - src/db.ts
- Dependencies:
  - T11
  - T12
- Validation:
  - manual onboarding smoke test
- Definition of Done:
  - a first-time player can understand the first three turns without external docs
  - tutorial copy is concise enough to stay readable during launch
  - tutorial and recovery guidance do not hide save or repair actions
- Handoff Notes:
  - keep this focused on clarity, not lore dumping

### T02c - Windows Local AI Smoke-Test Path

- Status: Review
- Queue: Now
- Phase: P0
- Priority: P2
- Owner Role: Tech lead
- Goal: Add a Windows-only local AI setup path that keeps the runtime provider-neutral and is cheap enough for smoke testing.
- Scope:
  - add a local provider mode with sensible defaults for a small Windows-friendly model stack
  - document the Windows install and startup flow in `setup_local_a.i.md`
  - expose the local env contract in repo docs and examples
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - README.md
  - REQUIREMENTS.md
  - .env.example
  - src/config.ts
  - setup_local_a.i.md
- Do Not Touch:
  - public/
  - data/spec/
  - src/server.ts
- Dependencies:
  - T02
- Validation:
  - `npm install`
  - `npm run dev`
  - manual config inspection for `AI_PROVIDER=ollama`
- Definition of Done:
  - a Windows developer has one documented local AI setup path to follow
  - the app can resolve local-provider defaults without extra code edits
  - setup and config docs match the implemented env behavior
- Handoff Notes:
  - use this path for smoke tests only until structured-output reliability is measured against fixtures
  - direct Ollama validation passed on 2026-03-07 for `POST /v1/chat/completions` with JSON schema, `POST /v1/embeddings`, and one full `game_turn`-shaped response using `gemma3:4b` plus `embeddinggemma`
  - this is still a developer smoke-test path, not the supported non-technical player path
  - `npm install`, `npm run dev`, and config runtime verification were not runnable in this session because `node` and `npm` were unavailable in the shell environment

### T02d - Local AI Workflow Regression Harness

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P2
- Owner Role: AI systems lead
- Goal: Turn local AI smoke checks into a repeatable regression workflow that developers can run before and after AI-related changes.
- Scope:
  - add a Windows-first script that validates the local OpenAI-compatible AI contract used by this repo
  - add one repo command that runs the local AI workflow test
  - document the expected red-green workflow for AI prompt, schema, and adapter changes
- Files to Touch:
  - BACKLOG.md
  - ENGINEERING_STANDARDS.md
  - README.md
  - package.json
  - setup_local_a.i.md
  - scripts/test-local-ai-workflow.ps1
- Do Not Touch:
  - public/
  - data/spec/
  - src/server.ts
  - src/ai.ts
- Dependencies:
  - T02c
- Validation:
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`
- Definition of Done:
  - the local AI contract can be re-run on demand with one documented command
  - the workflow explains when to run the harness before and after AI-related changes
  - failures are specific enough to point at the broken contract area
- Handoff Notes:
  - keep this harness provider-neutral at the API shape level even when Ollama is the current local default
  - validated on 2026-03-07 with `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` against local Ollama using `gemma3:4b` and `embeddinggemma`

### T02e - AI Test-First Workflow Policy

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make AI-facing changes follow a test-first workflow so future agent work is verified before behavior is changed.
- Scope:
  - define a repo-wide test-first policy for AI-related work
  - align agent instructions, engineering standards, and contributor docs on the same workflow
  - require AI behavior changes to add or tighten a reusable verification artifact before implementation
- Files to Touch:
  - BACKLOG.md
  - ENGINEERING_STANDARDS.md
  - README.md
  - AGENTS.md
  - .copilot-instructions
- Do Not Touch:
  - src/
  - public/
  - data/spec/
- Dependencies:
  - T02d
- Validation:
  - manual doc consistency review
- Definition of Done:
  - repo instructions explicitly require test-first handling for AI-related work
  - the AI workflow documents describe the same order of operations
  - future agents can identify what verification artifact must exist before implementation starts
- Handoff Notes:
  - user explicitly requested this process on 2026-03-07
  - future AI tasks should begin by updating a unit test, integration fixture, replay case, or the local AI workflow harness before changing implementation
  - manual consistency review completed across `ENGINEERING_STANDARDS.md`, `AGENTS.md`, `.copilot-instructions`, `README.md`, and this task card

## Immediate Open Decisions

| ID | Decision | Needed By | Owner | Status |
| --- | --- | --- | --- | --- |
| D01 | Numeric budgets for latency, token use, cost, and DB growth | Phase 0 exit | Tech lead | Open |
| D02 | Director spec format: JSON or YAML | Before T16 starts | Gameplay systems lead | Open |
| D03 | Sample MVP quest or story arc definition | Before Phase 1 exit | Product/UI lead | Open |
| D04 | MVP packaging shell: launcher-only, Tauri, or Electron | Before Phase 0 exit | Release lead | Open |
| D05 | Supported MVP AI setup for non-technical users: hosted, LiteLLM-managed, or guided local gateway | Before Phase 0 exit | Tech lead | Open |

## Agent Execution Rules

- Prefer the smallest task that unblocks the phase and removes the most player friction.
- Do not silently expand scope across multiple tasks.
- Do not mark a task `Done` without running its listed validation.
- If validation cannot be run, leave the task at `Review` and record exactly what is unverified.
- Update related docs in the same session when the task changes setup, scope, or behavior.
- If a task card is missing fields, repair the card before writing code.
- If the user request conflicts with the queue, follow the user request and then update this file to reflect reality.
- For AI-related work, require a test-first flow: add or tighten a test, fixture, replay case, or harness step before changing implementation, then run the focused check plus the relevant broader validation.
- For player-facing startup, setup, save or load, or packaging work, include a launcher or packaged-path smoke check whenever feasible.
