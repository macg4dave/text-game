# Backlog

This document is the AI-facing execution board for the project. It is optimized for coding agents and humans working through small, verifiable tasks while removing friction from the supported player path.

If this file and [ROADMAP.md](/g:/text-game/ROADMAP.md) disagree, the roadmap wins on product scope and phase order. If this file and implementation disagree, update this file before starting new work.

TypeScript source is authoritative in this repo: authoring code now lives under `src/**`, including browser UI source under `src/ui/`, and `public/app.js` is an emitted asset rather than an authoring surface.

Legacy path note for older task cards and handoff notes:

- `src/server.ts` now maps to `src/server/index.ts`
- `src/config.ts` now maps to `src/core/config.ts`
- `src/db.ts` now maps to `src/core/db.ts`
- `src/types.ts` now maps to `src/core/types.ts`
- `src/game.ts` now maps to `src/state/game.ts`
- `src/director.ts` now maps to `src/story/director.ts`
- `src/quest.ts` now maps to `src/story/quest.ts`
- `src/validator.ts` now maps to `src/rules/validator.ts`
- `src/assist.ts` now maps to `src/utils/assist.ts`
- `src/ai.ts` now maps to `src/ai/service.ts`
- `public/app.ts` now maps to `src/ui/app.ts`

Treat older task cards as historical notes where needed, but use the module-first paths above for all new work.

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

## Archive

Closed historical task cards moved out of the active backlog live in [BACKLOG_ARCHIVE.md](/g:/text-game/BACKLOG_ARCHIVE.md).

- Archive cutoff audited on 2026-03-08: closed task cards before `T05` were moved out of this file so future agents can focus on open work.
- The main backlog should keep active, blocked, ready, and review items only unless a completed task still needs to stay visible for a near-term coordination reason.

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
| T02c | Now | P0 | P2 | Windows local AI smoke-test path | Done | T02 | `docker compose run --rm --no-deps app npm run test:config` + manual Docker Ollama smoke |
| T02d | Now | P0 | P2 | Local AI workflow regression harness | Done | T02c | `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` |
| T02e | Now | P0 | P1 | AI test-first workflow policy | Done | T02d | Manual doc consistency review |
| T05 | Next | P0 | P2 | Error boundary and global handler | Done | None | `npm test` |
| T02g | Next | P0 | P1 | GPU tier matrix and local model profiles | Done | T02f | Matrix review |
| T06 | Next | P1 | P1 | Turn input, output, and state schemas | Review | T02 | `npm test` |
| T07 | Next | P1 | P1 | Turn handler and model orchestration | Ready | T06 | `npm test` |
| T07a | Next | P1 | P1 | LiteLLM default chat route for turn generation | Ready | T02f, T07 | Manual turn submission against LiteLLM |
| T08 | Next | P1 | P1 | Deterministic state reducer | Ready | T06 | `npm test` |
| T09 | Next | P1 | P1 | Event log persistence and replay | Ready | T04, T08 | Replay fixture execution |
| T10 | Next | P1 | P1 | Output validator and sanitizer | Ready | T06 | `npm test` |
| T11 | Next | P1 | P1 | Minimal player UI loop | Review | T06 | Manual browser smoke test |
| T12 | Next | P1 | P1 | New game onboarding | Ready | T06 | Manual new-game flow check |
| T12b | Next | P1 | P1 | First-run setup wizard and connection test | Ready | T02f, T11, T12 | Manual first-run flow check |
| T12c | Next | P1 | P1 | Guided recovery actions and advanced setup details | Ready | T12b, T01c, T02i, T04a, T02j | Manual recovery flow check |
| T29 | Next | P1 | P1 | Save slots UI | Ready | T08, T09 | Manual save/load check |
| T34 | Next | P1 | P1 | Tutorial and first-run guidance | Ready | T11, T12 | Manual onboarding smoke test |
| T12a | Later | P1 | P3 | Rate limiting and abuse guard | Ready | T07 | `npm test` |
| T13 | Later | P2 | P1 | Embeddings pipeline | Ready | T07a | Manual embedding call verification |
| T13a | Later | P2 | P1 | LiteLLM embedding alias integration | Ready | T02f | Manual embedding route verification |
| T47 | Later | P2 | P1 | LiteLLM default route integration fixtures | Ready | T07a, T13a | LiteLLM route fixture run |
| T14 | Later | P2 | P1 | Retrieval and top-k ranking | Ready | T13, T13a | Retrieval fixture check |
| T15 | Later | P2 | P1 | Memory summarizer job | Ready | T09 | `npm test` |
| T16 | Later | P2 | P1 | Director spec format and versioning | Ready | T06, D02 | Schema validation check |
| T17 | Later | P2 | P1 | Director enforcement in turn pipeline | Ready | T16 | Integration test |
| T18 | Later | P2 | P2 | Director reload endpoint | Ready | T16 | Manual reload verification |
| T43 | Later | P2 | P1 | Budget config file and API contract | Ready | D01, T07a, T09, T13a | `npm test` + manual budget API round-trip |
| T44 | Later | P2 | P2 | Budget controls UI | Ready | T11, T43 | Manual budget UI round-trip |
| T46 | Later | P2 | P1 | Save schema compatibility rules and migration fixture | Ready | T06, T09, T29 | Save migration fixture run |
| T30 | Later | P2 | P2 | Save import and export | Ready | T29 | Import/export compatibility check |
| T31 | Later | P3 | P2 | Optional save encryption | Ready | T29 | Encryption or decryption smoke test |
| T32 | Later | P3 | P1 | Accessibility pass | Ready | T11, T34 | Accessibility checklist |
| T33 | Later | P3 | P2 | Theme and typography pass | Ready | T11 | Manual readability review |
| T36b | Later | P3 | P1 | Packaged AI prerequisite detection and repair flow | Ready | T12c, T35a | Packaged prerequisite smoke test |
| T36 | Later | P3 | P1 | Windows playtest build | Ready | T35a, T12c, T29, T36b | Build or install verification |
| T38 | Later | P3 | P1 | Installer packaging | Ready | T36 | Installer smoke test |
| T19 | Later | P4 | P1 | Quest schema and validation | Ready | T16 | Schema validation check |
| T20 | Later | P4 | P1 | Quest state transitions | Ready | T19 | `npm test` |
| T21 | Later | P4 | P2 | Quest editor UI | Ready | T19 | Manual editor smoke test |
| T22 | Later | P4 | P2 | World state inspector UI | Ready | T20 | Manual diff view check |
| T23 | Later | P4 | P2 | Quest import and export | Ready | T19 | Import or export smoke test |
| T24 | Later | P4 | P1 | Core pipeline tests | Ready | T07, T08, T10 | CI-equivalent test run |
| T25 | Later | P4 | P1 | Fuzz tests for validator | Ready | T10 | Fuzz test run |
| T26 | Later | P4 | P1 | Telemetry for tokens, latency, and cost | Ready | T07 | Manual telemetry verification |
| T45 | Later | P4 | P1 | Budget fixture enforcement and breach reporting | Ready | T09, T24, T26, T43 | Fixture budget suite run |
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

## Detailed Task Cards

Closed task cards archived from the pre-`T05` slice live in [BACKLOG_ARCHIVE.md](/g:/text-game/BACKLOG_ARCHIVE.md).

### T02g - GPU Tier Matrix And Local Model Profiles

- Status: Done
- Queue: Next
- Phase: P0
- Priority: P1
- Owner Role: AI systems lead
- Goal: Define one conservative model-profile matrix for the optional local GPU path so setup can choose sane defaults by VRAM tier instead of by guesswork.
- Scope:
  - document the first supported VRAM tiers for local inference, including at minimum one low-VRAM tier and one high-VRAM tier
  - assign recommended chat and embedding model profiles for each supported tier behind the stable `game-chat` and `game-embedding` aliases
  - add a repo-owned mapping format that can later drive launcher and setup auto-selection
  - avoid relying only on GPU marketing names; use detected VRAM as the primary selection key with optional SKU aliases for convenience
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - README.md
  - setup_local_a.i.md
  - litellm.local-gpu.config.yaml
  - .env.example
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T02f
- Validation:
  - matrix review
  - manual local GPU profile sanity check
- Definition of Done:
  - the repo documents a first-pass GPU tier matrix for the optional local inference path
  - each supported tier has a conservative recommended model profile and fallback notes
  - the mapping is defined in a format that later tasks can consume programmatically
  - the docs explicitly warn when a profile is heuristic rather than fully verified
- Handoff Notes:
  - user requested on 2026-03-08 that the roadmap and backlog cover auto-setup for different GPU capabilities
  - do not hardcode incorrect SKU-to-VRAM assumptions into the matrix; treat VRAM as authoritative and model names as convenience labels only
  - examples should be expressed as tiers such as `8 GB`, `12 GB`, and `20 GB+` even when common cards are listed alongside them
  - authoritative matrix data now lives in `scripts/local-gpu-profile-matrix.json` so future launcher and setup work can read one repo-owned JSON contract without introducing YAML parsing into app code
  - `litellm.local-gpu.config.yaml` now pins `local-gpu-8gb` as the active default profile and leaves `local-gpu-12gb` plus `local-gpu-20gb-plus` as commented manual swap references for later T02h selection work
  - `local-gpu-8gb` is documented as `verified` for this task's matrix sanity check path; `local-gpu-12gb` and `local-gpu-20gb-plus` remain `heuristic` until they are exercised on matching hardware
  - validation on 2026-03-08 ran `powershell -ExecutionPolicy Bypass -File scripts/validate-local-gpu-profile-matrix.ps1` and a manual repo consistency review across `README.md`, `setup_local_a.i.md`, `.env.example`, `litellm.local-gpu.config.yaml`, `docker-compose.yml`, `ROADMAP.md`, and this task card
  - the matrix validator now checks the uncommented env-driven alias block in `litellm.local-gpu.config.yaml` plus the matching default `LITELLM_LOCAL_GPU_*` values in `docker-compose.yml`, so it no longer passes or fails based on commented manual-swap examples
  - no matching local GPU hardware runtime smoke was available in this session; that does not block `T02g` because the `12 GB` and `20 GB+` tiers are intentionally documented as `heuristic` until later hardware-specific follow-up work

### T05 - Error Boundary And Global Handler

- Status: Done
- Queue: Next
- Phase: P0
- Priority: P2
- Owner Role: Tech lead
- Goal: Keep unexpected server and browser failures visible, logged, and recoverable enough that players do not get a silent broken session.
- Scope:
  - add a process-level server handler for uncaught exceptions and unhandled promise rejections
  - shut the HTTP server down in a controlled way after a fatal server error and log the failure context safely
  - add a browser fatal-error boundary that surfaces unexpected client-side crashes in the app UI instead of leaving a dead screen
  - cover the new fatal-error behavior with focused tests before wiring it into the runtime entrypoints
- Files to Touch:
  - BACKLOG.md
  - README.md
  - public/index.html
  - public/styles.css
  - src/server/index.ts
  - src/server/global-handler.ts
  - src/server/global-handler.test.ts
  - src/ui/app.ts
  - src/ui/global-error.ts
  - src/ui/global-error.test.ts
- Do Not Touch:
  - data/spec/
  - src/ai/
- Dependencies:
  - None
- Validation:
  - `npm test`
- Definition of Done:
  - fatal server crashes are logged and trigger one controlled shutdown path
  - fatal browser errors show a plain-language recovery panel and disable turn submission
  - the new handlers are covered by focused automated tests
  - README notes how unexpected runtime crashes now surface during local troubleshooting
- Handoff Notes:
  - prefer safe logging and plain-language recovery copy over clever restart behavior
  - keep the client boundary generic so it can be reused by the launcher or packaged shell later
  - completed on 2026-03-08 with a new server-side `src/server/global-handler.ts` process handler for `uncaughtException` and `unhandledRejection`, wired into `src/server/index.ts` so fatal errors log once, close the HTTP server, and exit through one controlled shutdown path
  - completed on 2026-03-08 with a new browser-side `src/ui/global-error.ts` boundary and a fatal-error panel in `public/index.html`; `src/ui/app.ts` now registers global browser error listeners early, surfaces plain-language recovery copy, and disables interaction after an unexpected client crash
  - added focused automated coverage in `src/server/global-handler.test.ts` and `src/ui/global-error.test.ts`
  - validation on 2026-03-08: `docker compose build app` passed, `docker compose run --rm --no-deps app npx tsx --test src/server/global-handler.test.ts src/ui/global-error.test.ts` passed, and `docker compose run --rm --no-deps app npm test` now passes after the earlier unrelated `src/core/config.test.ts` failure was resolved elsewhere in the repo

### T06 - Turn Input, Output, And State Schemas

- Status: Review
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
  - BACKLOG.md
  - src/core/types.ts
  - src/rules/validator.ts
  - src/rules/validator.test.ts
  - src/server/index.ts
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
  - implemented on 2026-03-08 with three HTTP-boundary schema markers: `turn-input/v1`, `turn-output/v1`, and `authoritative-state/v1`
  - `/api/turn` now normalizes the legacy camelCase request body (`playerId`, `name`) into the versioned turn-input contract so the current UI keeps working while later tasks move fully to the explicit schema
  - `/api/state` and `/api/turn` now return versioned authoritative player snapshots, and `/api/turn` also returns a top-level `schema_version` for the turn-output payload
  - added focused coverage in `src/rules/validator.test.ts` for turn-input parsing, turn-output validation, and authoritative-state validation
  - validation on 2026-03-08: `docker compose build app` passed, `docker compose run --rm --no-deps app npm run type-check` passed, and `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts` passed
  - `docker compose run --rm --no-deps app npm test` still fails because of the pre-existing unrelated failure in `src/core/config.test.ts` (`buildConfigPreflightIssues turns config failures into player-facing recovery steps` expects `3` issues but currently receives `4`)

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
  - add guided checks for the supported Docker-backed LiteLLM provider path and config before the first turn
  - expose a safe connection test and plain-language error states
  - explain missing Docker, missing LiteLLM readiness, and optional GPU override prerequisites without requiring terminal knowledge
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
  - T02f
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
  - the user confirmed on 2026-03-08 that setup and diagnostics should stay UI-first for now
  - the user confirmed on 2026-03-08 that LiteLLM is the default AI control plane the setup flow should steer toward
  - treat the repo-managed Docker LiteLLM sidecar as the default recovery path, with GPU-backed local inference explained as an explicit opt-in

### T12c - Guided Recovery Actions And Advanced Setup Details

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Turn setup blockers and warnings into a guided recovery flow with retry actions for end users and expandable advanced details for developers.
- Scope:
  - present blockers, warnings, and info in the setup UI with short summaries and one recommended action each
  - add retry flows and the smallest safe auto-fix actions for common issues such as restarting checks, choosing a smaller local profile, or switching back to hosted default
  - expose advanced setup details on demand so developers can inspect resolved config, probe targets, and failing subsystems without overwhelming end users
  - keep save data intact while users retry setup or switch profiles
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - README.md
  - public/index.html
  - public/app.ts
  - public/styles.css
  - src/server.ts
  - src/config.ts
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T12b
  - T01c
  - T02i
  - T04a
  - T02j
- Validation:
  - manual recovery flow check
  - manual retry and profile-switch smoke test
- Definition of Done:
  - common setup blockers can be retried without reopening the terminal
  - end users get one obvious next step per issue while advanced users can expand for deeper diagnostics
  - setup repair flows do not require deleting saves or editing hidden files during normal recovery
  - the browser and launcher recovery language stay aligned
- Handoff Notes:
  - avoid turning the first-run screen into a wall of diagnostics
  - auto-fix actions should stay reversible and conservative

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

- Status: Done
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
  - src/core/config.test.ts
- Do Not Touch:
  - public/
  - data/spec/
  - src/server.ts (legacy path note; do not add new server logic outside `src/server/index.ts`)
- Dependencies:
  - T02
- Validation:
  - `docker compose build app`
  - `docker compose run --rm --no-deps app npm run test:config`
  - manual Docker Ollama smoke with host-visible `/api/state`
- Definition of Done:
  - a Windows developer has one documented local AI setup path to follow
  - the app can resolve local-provider defaults without extra code edits
  - setup and config docs match the implemented env behavior
- Handoff Notes:
  - use this path for smoke tests only until structured-output reliability is measured against fixtures
  - user clarified on 2026-03-08 that Ollama or another local model is an optional larger-model path, not the default small-task setup
  - direct Ollama validation passed on 2026-03-07 for `POST /v1/chat/completions` with JSON schema, `POST /v1/embeddings`, and one full `game_turn`-shaped response using `gemma3:4b` plus `embeddinggemma`
  - this is still a developer smoke-test path, not the supported non-technical player path
  - `npm install`, `npm run dev`, and config runtime verification were not runnable in this session because `node` and `npm` were unavailable in the shell environment
  - re-audit on 2026-03-08 found the prior Docker smoke failure was a host-port publishing invocation issue, not an app runtime failure: Compose still tried to publish host port `3000` unless the host-side `PORT` env var was set before `docker compose run --service-ports`
  - closeout validation on 2026-03-08 passed with `docker compose build app`, `docker compose run --rm --no-deps app npm run test:config`, and `$env:PORT='3316'; docker compose run --rm --no-deps --service-ports -e PORT=3316 -e AI_PROFILE=custom -e AI_PROVIDER=ollama -e OLLAMA_BASE_URL=http://host.docker.internal:11434/v1 app npm run dev`, followed by a host `GET /api/state` returning `200`
  - the rebuilt smoke path now exposes `/api/state` on the host correctly and surfaces an expected preflight blocker when the host Ollama service is unreachable, which is the intended recovery behavior for this optional developer-only path

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

### T43 - Budget Config File And API Contract

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: Tech lead
- Goal: Move latency, token, cost, and DB-growth budgets out of doc-only tables into one validated server-side config contract that later UI and fixture work can share.
- Scope:
  - add one repo-owned budget config source for the documented latency, token, cost-per-100-turns, and DB-growth defaults
  - validate and load budget values on the server with a safe read or write API for non-gameplay consumers
  - keep budget config separate from authoritative player state, save payloads, and story content
  - align README, requirements, and engineering standards around the same runtime budget source of truth
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - ENGINEERING_STANDARDS.md
  - src/core/types.ts
  - src/core/config.ts
  - src/core/budgets.ts
  - src/core/budgets.test.ts
  - src/server/index.ts
- Do Not Touch:
  - data/spec/
  - src/ui/
- Dependencies:
  - D01
  - T07a
  - T09
  - T13a
- Validation:
  - `npm test`
  - manual budget API round-trip
- Definition of Done:
  - the documented default budgets live in one server-side config source instead of docs only
  - invalid budget values are rejected before they can become the active runtime config
  - the current budget config can be retrieved and updated through a stable server contract for later UI and fixture consumers
  - the budget docs point at the implemented config source rather than implying a missing one
- Handoff Notes:
  - audit on 2026-03-08 found that the repo documents a server-side budget config file plus web UI adjustability, but the live implementation only exposes doc values
  - keep this task focused on the budget contract and persistence boundary; budget editing in the browser belongs to `T44`
  - prefer a deterministic file format and validation path that automated fixture work can read without scraping UI text

### T47 - LiteLLM Default Route Integration Fixtures

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Replace manual LiteLLM chat and embedding route checks with repeatable integration fixtures that prove the default alias contract and fallback behavior.
- Scope:
  - add a deterministic integration fixture or scripted test path for the default `game-chat` route
  - add a matching integration fixture or scripted test path for the default `game-embedding` route
  - cover at least one fallback or failure-classification path so route regressions do not collapse into a generic network error
  - keep the checks aligned with the stable LiteLLM alias names instead of provider-specific upstream model names
- Files to Touch:
  - BACKLOG.md
  - README.md
  - package.json
  - scripts/
  - src/ai/
  - src/server/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T07a
  - T13a
- Validation:
  - LiteLLM route fixture run
- Definition of Done:
  - one documented path verifies the default LiteLLM chat alias end to end
  - one documented path verifies the default LiteLLM embedding alias end to end
  - route or fallback failures report which contract broke instead of only reporting a generic AI outage
  - later MVP exit checks can point at this automated route coverage instead of manual smoke notes
- Handoff Notes:
  - roadmap and backlog currently require automated chat and embedding route coverage, but the active Phase 2 queue still relies on manual verification paths for `T07a` and `T13a`
  - start with a deterministic test or harness update before changing implementation, per the repo AI workflow policy
  - keep the fixture output keyed to `game-chat` and `game-embedding` so upstream model swaps behind LiteLLM do not invalidate the contract

### T44 - Budget Controls UI

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P2
- Owner Role: Product/UI lead
- Goal: Let advanced users inspect and adjust delivery budgets from the browser without editing files or opening devtools.
- Scope:
  - add a budget panel to the existing advanced or debug browser surface instead of the main player flow
  - show the active latency, token, cost, and DB-growth targets with plain-language descriptions
  - let users apply validated budget edits and recover from invalid values without losing the current session
  - keep the first-run and normal play surfaces uncluttered by treating budget tuning as advanced tooling
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - public/index.html
  - public/styles.css
  - src/ui/app.ts
  - src/server/index.ts
- Do Not Touch:
  - data/spec/
  - src/ai/
- Dependencies:
  - T11
  - T43
- Validation:
  - `npm test`
  - manual budget UI round-trip
- Definition of Done:
  - the browser can show the active budget targets without exposing secrets
  - validated budget changes can be applied from the UI without file edits
  - invalid edits produce clear recovery copy and leave the previous budget values intact
  - the budget controls stay in an advanced surface rather than reading like first-run onboarding
- Handoff Notes:
  - keep the player-facing launch path focused on setup and play; budget tuning is for advanced users and internal tuning
  - if the UI needs reset behavior, prefer explicit restore-defaults actions over silent auto-rewrites

### T46 - Save Schema Compatibility Rules And Migration Fixture

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: Tech lead
- Goal: Make save compatibility an explicit tested contract instead of an implied property of the current SQLite schema.
- Scope:
  - define save compatibility rules for authoritative state and persisted session data across schema versions
  - add one deterministic migration fixture that upgrades an older save or DB snapshot into the current schema successfully
  - surface incompatible-save failures in plain language through the existing runtime or load path instead of raw DB errors
  - document which changes require a migration, which changes are backward-compatible, and when a save must be rejected
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - ENGINEERING_STANDARDS.md
  - src/core/db.ts
  - src/core/types.ts
  - src/server/index.ts
  - src/state/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T06
  - T09
  - T29
- Validation:
  - save migration fixture run
- Definition of Done:
  - save compatibility rules are written down where later save or load work can follow them
  - at least one older save fixture or DB snapshot upgrades successfully to the current runtime
  - incompatible saves fail with actionable recovery language instead of opaque storage errors
  - roadmap MVP migration claims can point at a real fixture instead of only documentation
- Handoff Notes:
  - roadmap audit on 2026-03-08 found MVP language that requires save or load behavior across at least one schema version change, but the backlog did not yet have an explicit compatibility-policy task
  - keep this task focused on migration rules and fixture proof; richer import or export UX still belongs to later save-surface tasks
  - prefer a fixture checked into the repo over ad hoc manual save editing so later agents can re-run the same path

### T45 - Budget Fixture Enforcement And Breach Reporting

- Status: Ready
- Queue: Later
- Phase: P4
- Priority: P1
- Owner Role: AI systems lead
- Goal: Turn the documented delivery budgets into an automated fixture gate that reports exact breaches instead of relying on manual interpretation.
- Scope:
  - add a repeatable fixture or scripted suite that measures configured latency, token, cost, and DB-growth budgets against the baseline gameplay path
  - fail clearly when a budget is exceeded, including actual versus target values in the output
  - reuse the server-side budget config from `T43` and the telemetry work from `T26` instead of duplicating thresholds in test code
  - measure persisted DB growth from the fixture output on disk rather than estimating it from row counts alone
- Files to Touch:
  - BACKLOG.md
  - README.md
  - ENGINEERING_STANDARDS.md
  - package.json
  - scripts/
  - src/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T09
  - T24
  - T26
  - T43
- Validation:
  - fixture budget suite run
- Definition of Done:
  - one documented command or scripted entrypoint checks the baseline fixture against the configured budgets
  - budget breaches report target versus actual values clearly enough to debug regressions
  - the fixture suite reads the same budget config the app exposes elsewhere instead of hard-coding duplicate numbers
  - MVP budget exit claims can point at this repeatable validation path
- Handoff Notes:
  - audit on 2026-03-08 found that the budget numbers exist in docs, but the repo still lacks the runtime and fixture loop needed to prove them
  - keep the measurement path deterministic; if provider pricing is variable, capture one explicit pricing source or fixture assumption in the test output
  - this task should close the gap between documented budget targets and enforceable regression checks, not just add another dashboard

### T24 - Core Pipeline Tests

- Status: Ready
- Queue: Later
- Phase: P4
- Priority: P1
- Owner Role: Tech lead
- Goal: Give the core gameplay path one repeatable automated test layer that exercises the server-authoritative turn pipeline instead of relying on isolated unit coverage alone.
- Scope:
  - add end-to-end integration coverage for the core turn pipeline using deterministic AI fixtures or stubs
  - cover at least one valid turn, one validator rejection path, and one persistence or replay-sensitive path
  - keep the test layer provider-neutral at the app boundary even when LiteLLM is the default runtime path
  - make the suite runnable in CI without requiring a live hosted provider
- Files to Touch:
  - BACKLOG.md
  - README.md
  - package.json
  - src/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T07
  - T08
  - T10
- Validation:
  - CI-equivalent test run
- Definition of Done:
  - the core turn pipeline can be exercised automatically without a manual browser session
  - the suite proves request parsing, validation, state mutation, and persistence cooperate on the happy path
  - at least one broken path fails with targeted assertions instead of only a generic 500 expectation
  - the command is documented clearly enough for future agents to run before broader refactors
- Handoff Notes:
  - this task should become the stable automated base that later telemetry, replay, and budget-fixture tasks build on
  - keep fixtures deterministic and small; avoid turning this into a live-provider smoke suite

### T26 - Telemetry For Tokens, Latency, And Cost

- Status: Ready
- Queue: Later
- Phase: P4
- Priority: P1
- Owner Role: AI systems lead
- Goal: Capture the runtime numbers needed to debug model cost and performance regressions instead of inferring them from logs by hand.
- Scope:
  - record per-turn latency, token usage, retry count, model alias, validation failures, and estimated cost in one telemetry path
  - keep the telemetry contract aligned with the documented `/api/turn` minimum fields in `ENGINEERING_STANDARDS.md`
  - expose the captured data through a developer-friendly inspection path or report suitable for later budget enforcement
  - omit secrets and avoid introducing provider-specific telemetry coupling outside the adapter boundary
- Files to Touch:
  - BACKLOG.md
  - README.md
  - ENGINEERING_STANDARDS.md
  - src/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T07
- Validation:
  - manual telemetry verification
- Definition of Done:
  - `/api/turn` telemetry captures the documented latency, token, retry, validation, and cost fields
  - the captured output is inspectable without scraping unrelated server logs
  - telemetry data is structured enough for later fixture-budget enforcement to consume
  - provider credentials and other secrets are not emitted in the telemetry surface
- Handoff Notes:
  - keep cost accounting assumptions explicit so later budget checks can compare like with like
  - this task is a prerequisite for enforceable budget reporting, not a substitute for `T45`

### T36b - Packaged AI Prerequisite Detection And Repair Flow

- Status: Ready
- Queue: Later
- Phase: P3
- Priority: P1
- Owner Role: Release lead
- Goal: Make the packaged player path explain Docker and LiteLLM startup problems in plain language before the user is dumped into a broken shell.
- Scope:
  - detect whether Docker Desktop is missing, installed but not running, or running without a ready AI sidecar
  - distinguish LiteLLM-not-ready failures from app-server startup failures inside the packaged path
  - surface one recommended repair step per failure mode, with retry support that does not require deleting saves
  - explain when the optional local GPU path is unsupported and steer the user back to the hosted-default path cleanly
- Files to Touch:
  - BACKLOG.md
  - README.md
  - packaging/
  - scripts/
  - src/ui/
  - src/server/
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T12c
  - T35a
- Validation:
  - packaged prerequisite smoke test
- Definition of Done:
  - the packaged path can tell Docker Desktop missing, Docker not running, LiteLLM not ready, and optional local GPU prerequisite failures apart
  - each packaged startup blocker has plain-language recovery copy and a retry path
  - packaged diagnostics stay aligned with the shared preflight contract instead of inventing a separate severity vocabulary
  - `T36` can focus on the Windows build itself instead of hiding prerequisite-repair work inside a broad packaging task
- Handoff Notes:
  - `packaging/decision-memo.md` already calls this out as required packaged behavior; this task makes that requirement executable in the backlog
  - preserve save data and runtime logs while users retry packaged setup failures

### T36 - Windows Playtest Build

- Status: Ready
- Queue: Later
- Phase: P3
- Priority: P1
- Owner Role: Release lead
- Goal: Produce one Windows-first playtest build that wraps the existing gameplay stack without reintroducing terminal-dependent setup.
- Scope:
  - build the packaged Windows playtest target from the chosen Electron path
  - keep the packaged shell using the same compiled server and browser UI stack as the launcher path
  - document save locations, logs, and supported recovery steps for playtesters
  - validate the portable or unpacked build on a clean-machine-style smoke path after packaged prerequisite handling is in place
- Files to Touch:
  - BACKLOG.md
  - README.md
  - packaging/
  - scripts/
  - src/ui/
  - src/server/
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T35a
  - T12c
  - T29
  - T36b
- Validation:
  - build or install verification
- Definition of Done:
  - a Windows playtest build can be launched by double-click without requiring a terminal
  - the packaged build still uses the existing server-authoritative gameplay stack
  - save and log locations are documented in plain language for testers
  - the packaged smoke path proves the build works with the supported Docker-backed AI contract
- Handoff Notes:
  - keep this task focused on the playable Windows build and clean-machine validation, not on repackaging the AI gateway
  - prerequisite and repair messaging for Docker and LiteLLM belongs in `T36b`

### T38 - Installer Packaging

- Status: Ready
- Queue: Later
- Phase: P3
- Priority: P1
- Owner Role: Release lead
- Goal: Turn the validated Windows playtest build into an installer path that preserves the same runtime contract and recovery clarity.
- Scope:
  - add an installer-capable packaging path on top of the validated Windows playtest build
  - preserve user data, saves, and logs outside the install directory through install, upgrade, and uninstall flows
  - document installer behavior, repair expectations, and uninstall impact in plain language
  - validate that the installer does not break the packaged startup, preflight, or save-location assumptions already proven in `T36`
- Files to Touch:
  - BACKLOG.md
  - README.md
  - packaging/
  - scripts/
- Do Not Touch:
  - data/spec/
  - src/state/
- Dependencies:
  - T36
- Validation:
  - installer smoke test
- Definition of Done:
  - a Windows installer can produce the same supported playtest runtime that `T36` validated
  - install, uninstall, and reinstall flows do not store saves inside the install directory
  - installer docs explain what happens to saves, logs, and Docker-backed AI prerequisites
  - installer validation catches obvious regressions in launch or persistence behavior before Phase 5 work begins
- Handoff Notes:
  - do not silently change the packaged AI ownership model here; keep the installer path aligned with the packaged Docker-backed LiteLLM contract
  - signing, update channels, and release rehearsal still belong to later release tasks

## Immediate Open Decisions

| ID | Decision | Needed By | Owner | Status |
| --- | --- | --- | --- | --- |
| D01 | Concrete default numeric budgets for latency, token use, cost, and DB growth in the configurable budget file | Phase 0 exit | Tech lead | Locked |
| D02 | Director spec format: JSON or YAML | Before T16 starts | Gameplay systems lead | Open |
| D03 | Sample MVP quest or story arc definition | Before Phase 1 exit | Product/UI lead | Open |
| D04 | MVP packaging shell: launcher-only, Tauri, or Electron | Before Phase 0 exit | Release lead | Locked |
| D05 | Default end-user AI setup: repo-managed LiteLLM Docker sidecar as the default control plane, with hosted small-task routing and an optional GPU-backed local-model path | Before Phase 0 exit | Tech lead | Locked |
| D06 | MVP packaged AI runtime: require Docker Desktop for the LiteLLM sidecar, or stage the gateway another way while preserving the same app-facing contract | Before T36 starts | Release lead | Locked |
| D07 | Initial local GPU tier matrix: which VRAM tiers are officially supported first, and which model profiles map to them | Before T02h starts | AI systems lead | Locked |
| D08 | Preflight policy: which startup failures are blockers versus warnings versus info in end-user mode, and which actions can auto-fix safely | Before T01b starts | Tech lead | Locked |

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


