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
| T01 | Now | P0 | P1 | Player launch bootstrap path | Done | None | `docker compose up --build`; `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1` |
| T41 | Now | P0 | P1 | Full TypeScript migration | Done | None | `npm run type-check`; `npm test`; `docker compose up --build`; `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1` |
| T42 | Now | P0 | P1 | Module-first source and script layout | Done | T41 | `npm run type-check`; `npm test`; `npm run build`; `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` |
| T01a | Now | P0 | P1 | Runtime preflight and recovery messaging | Done | T01, T02 | Manual launcher failure checks |
| T35 | Now | P0 | P1 | Packaging prototype and decision memo | Done | T01 | Prototype build verification |
| T02 | Now | P0 | P1 | Config module with schema validation | Done | None | `npm test` |
| T02a | Now | P0 | P1 | LiteLLM env contract and alias defaults | Done | T02 | Manual config verification |
| T02b | Now | P0 | P1 | LiteLLM proxy template and startup docs | Review | T02a | Manual LiteLLM startup verification |
| T02c | Now | P0 | P2 | Windows local AI smoke-test path | Review | T02 | Manual local provider startup verification |
| T02f | Now | P0 | P1 | Docker-first LiteLLM sidecar and GPU override | Review | T02a, T02b | `docker compose up --build`; `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`; `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` |
| T02d | Now | P0 | P2 | Local AI workflow regression harness | Done | T02c | `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` |
| T02e | Now | P0 | P1 | AI test-first workflow policy | Done | T02d | Manual doc consistency review |
| T01b | Now | P0 | P1 | Preflight blocker contract and advanced diagnostics | Done | T01a, T02 | `npm test`; manual blocked and warning preflight check |
| T01c | Now | P0 | P1 | Host runtime and path prerequisite checks | Done | T01, T01b | `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` |
| T02i | Now | P0 | P1 | AI readiness, network, and model-availability probes | Done | T01b, T02f | Manual LiteLLM readiness probe |
| T03 | Now | P0 | P1 | Logging with levels and redaction | Done | None | `npm test` |
| T04 | Now | P0 | P1 | DB migrations and seed flow | Done | None | Manual DB reset verification |
| T04a | Now | P0 | P1 | Storage, save, and migration preflight | Ready | T04, T01b | Manual DB and save preflight smoke test |
| T02j | Now | P0 | P1 | End-user config profiles and validated developer overrides | Ready | T01b, T02a, T02g | `npm test`; manual profile resolution check |
| T05 | Next | P0 | P2 | Error boundary and global handler | Ready | None | `npm test` |
| T35a | Next | P0 | P1 | Packaged AI runtime decision for Docker LiteLLM | Done | T35, T02f | Decision memo review |
| T02g | Next | P0 | P1 | GPU tier matrix and local model profiles | Ready | T02f | Matrix review |
| T06 | Next | P1 | P1 | Turn input, output, and state schemas | Ready | T02 | `npm test` |
| T07 | Next | P1 | P1 | Turn handler and model orchestration | Ready | T06 | `npm test` |
| T02h | Next | P1 | P1 | Auto-select local GPU model profile | Ready | T02g, T02j, T12b | `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`; manual local GPU startup check |
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
| T14 | Later | P2 | P1 | Retrieval and top-k ranking | Ready | T13, T13a | Retrieval fixture check |
| T15 | Later | P2 | P1 | Memory summarizer job | Ready | T09 | `npm test` |
| T16 | Later | P2 | P1 | Director spec format and versioning | Ready | T06, D02 | Schema validation check |
| T17 | Later | P2 | P1 | Director enforcement in turn pipeline | Ready | T16 | Integration test |
| T18 | Later | P2 | P2 | Director reload endpoint | Ready | T16 | Manual reload verification |
| T30 | Later | P2 | P2 | Save import and export | Ready | T29 | Import/export compatibility check |
| T31 | Later | P3 | P2 | Optional save encryption | Ready | T29 | Encryption or decryption smoke test |
| T32 | Later | P3 | P1 | Accessibility pass | Ready | T11, T34 | Accessibility checklist |
| T33 | Later | P3 | P2 | Theme and typography pass | Ready | T11 | Manual readability review |
| T36 | Later | P3 | P1 | Windows playtest build | Ready | T35a, T12c, T29 | Build or install verification |
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

- Status: Done
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
  - final closeout validation on 2026-03-08 rechecked the raw Docker path on `PORT=3300` because host port `3000` still resolved to an unrelated responder on this machine; `GET /` returned the `Eclipse Signal` page and `GET /api/state` returned a player payload as expected
  - final closeout validation on 2026-03-08 rechecked `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` with no manual port override; the launcher again detected `wslrelay` on `3000`, selected `3100`, and served a healthy `/api/state` response there

### T01a - Runtime Preflight And Recovery Messaging

- Status: Done
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
  - final closeout validation on 2026-03-08 re-ran `docker compose run --rm app npm run type-check` and `docker compose run --rm app npm test` successfully from the main workspace
  - final launcher validation on 2026-03-08 used a clean temp repo copy on `C:` so Docker bind-mount behavior from `G:` would not affect the result: with `AI_PROVIDER=openai-compatible` and no API key, `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` started the app and `/api/state` returned a blocked preflight containing `missing_api_key`; with `AI_PROVIDER=litellm` and `LITELLM_PROXY_URL=http://127.0.0.1:4011`, the launcher failed before container startup with `Configured local AI endpoint did not respond`

### T42 - Module-First Source And Script Layout

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Replace the flat source layout and repeated script plumbing with a module-first structure that is easier to debug and extend.
- Scope:
  - move TypeScript authoring code into feature folders under `src/**`
  - move browser authoring source into `src/ui/` while continuing to emit `public/app.js`
  - reduce repeated PowerShell launcher logic through shared helper modules under `scripts/lib/`
  - update build, packaging, and docs to reflect the new module paths
- Files to Touch:
  - BACKLOG.md
  - AGENTS.md
  - ARCHITECTURE.md
  - AI_CONTROL.md
  - README.md
  - package.json
  - tsconfig.json
  - tsconfig.server.json
  - packaging/
  - public/
  - scripts/
  - src/
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T41
- Validation:
  - `npm run type-check`
  - `npm test`
  - `npm run build`
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
- Definition of Done:
  - the flat `src/*.ts` authoring layout is replaced by module folders under `src/**`
  - browser authoring code builds from `src/ui/` to `public/app.js`
  - startup and test scripts share common helper logic instead of duplicating config and probing behavior
  - docs and packaging references match the new layout
- Handoff Notes:
  - user explicitly assigned this structural refactor on 2026-03-08, overriding normal queue order
  - favor small compatibility-preserving moves inside the implementation, but the final authoring layout should read as module-first rather than flat
  - first implementation pass moved authoring files into `src/core`, `src/state`, `src/story`, `src/rules`, `src/utils`, `src/ai`, `src/server`, and `src/ui`
  - follow-up structural pass split the oversized server entrypoint into focused helpers under `src/server/` for runtime preflight, turn-result sanitization, player-state normalization, prompt text, and debug payload shaping
  - follow-up structural pass also split `src/core/config.ts` into internal config modules for env resolution, validation, and preflight issue mapping while keeping the public import path stable
  - browser build input now points at `src/ui/app.ts`, while `public/app.ts` remains only as a legacy placeholder and is no longer the source of truth
  - startup and local AI scripts now share dotenv/config/HTTP helper functions through `scripts/lib/shared.ps1`, including one shared AI config-resolution path
  - validation on 2026-03-08 passed with `docker compose run --rm app npm run type-check`, `docker compose run --rm app npm test`, `docker compose build app`, `docker compose run --rm app npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
  - closeout validation on 2026-03-08 also passed after the server split with `docker compose run --rm app npm run type-check`, `docker compose run --rm app npm test`, `docker compose run --rm app npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
  - the launcher-driven Docker image build exposed one extra compatibility issue that the direct container checks did not surface: `src/core/types.ts` now uses `NodeJS.ProcessEnv` instead of importing `ProcessEnv` from `node:process`
  - reran the local AI harness after the shared script refactor to confirm the shared config-resolution path still behaved correctly; it failed for the expected environmental reason because the current `.env` still points at an unreachable local Ollama endpoint
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` was executed after the script refactor but failed in the current shell because the active local AI config still resolved to an unreachable Ollama endpoint at `http://127.0.0.1:11434/v1`; the script now reports that failure earlier and more clearly

### T01b - Preflight Blocker Contract And Advanced Diagnostics

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make every startup check resolve to one shared blocker, warning, or info contract that stays simple for end users and rich enough for developers.
- Scope:
  - define one preflight result schema shared by launcher, server, browser UI, and future packaged shell
  - classify checks as `blocker`, `warning`, or `info`, with explicit rules for what stops the first turn versus what only warns
  - keep the player-facing summary plain-language while exposing advanced diagnostics such as resolved config sources and exact probe targets behind an expandable details surface
  - document the preflight policy so later tasks can add checks without inventing new severity rules
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - README.md
  - src/config.ts
  - src/server.ts
  - public/app.ts
  - public/index.html
  - scripts/start-dev.ps1
  - packaging/
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T01a
  - T02
- Validation:
  - `npm test`
  - manual blocked and warning preflight check
- Definition of Done:
  - launcher, API, browser UI, and packaged path can speak the same preflight severity language
  - end users see one recommended fix for each blocker without raw implementation jargon
  - developers can inspect advanced details without changing the end-user-first default surface
  - later checks can declare blocker or warning behavior without redefining the contract
- Handoff Notes:
  - user requested on 2026-03-08 that startup should be easy for end users while still allowing dev-friendly config changes
  - treat blocker classification as a product policy, not just a logging detail
  - prefer conservative blocking on write, save, and AI-startup failures; prefer warnings for likely performance issues and optional tuning gaps
  - completed on 2026-03-08 with one shared preflight contract: `status` is now `checking`, `ready`, or `action-required`, and issue severities are `blocker`, `warning`, or `info`
  - config-driven preflight now includes one recommended fix per issue plus optional advanced details such as config source and probe target metadata
  - browser setup UI now shows warning and info issues without blocking play, blocks only on `blocker`, and exposes advanced setup details behind expandable sections
  - the Windows launcher now formats host-side failures with the same issue vocabulary and prints app-reported preflight issues after startup when present
  - packaging guidance now explicitly points the future shell at the same preflight contract instead of inventing a new one
  - validated on 2026-03-08 with `docker compose build app`, `docker compose run --rm app npm run type-check`, `docker compose run --rm app npm test`, `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`, and focused Docker-side preflight checks against `dist/config.js` for one blocker case (`AI_PROVIDER=openai-compatible`, invalid URL, missing key) and one non-blocking warning case (legacy `OPENAI_API_KEY` with inferred provider)

### T01c - Host Runtime And Path Prerequisite Checks

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Detect the host prerequisites that commonly fail before the app becomes reachable, then stop early with plain-language fixes.
- Scope:
  - validate Docker, Compose, and Windows-specific prerequisites such as WSL2 or equivalent runtime requirements for the supported path
  - detect port conflicts, missing browser or desktop-shell launch capability, unwritable app-data paths, and low free disk before runtime startup proceeds
  - cover local GPU prerequisites for the optional path without turning them into blockers for the hosted-default path
  - expose the results through the shared preflight contract so launcher and UI wording stay aligned
- Files to Touch:
  - BACKLOG.md
  - README.md
  - scripts/lib/shared.ps1
  - scripts/start-dev.ps1
  - src/server/runtime-preflight.ts
  - src/server/host-preflight.ts
  - src/server/host-preflight.test.ts
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T01
  - T01b
- Validation:
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
  - manual port, path, and missing-runtime smoke checks
- Definition of Done:
  - the supported launch path fails early for missing host prerequisites instead of timing out later
  - write-path and disk-space failures are explained before saves or logs are attempted
  - optional local GPU prerequisites are warnings or blockers only when that mode is selected
  - launcher and packaged-path wording can reuse the same host-prerequisite results
- Handoff Notes:
  - completed on 2026-03-08 with a new `src/server/host-preflight.ts` module so runtime preflight now reports storage blockers and warnings for unwritable app-data paths plus low disk headroom before the first turn
  - the Windows launcher now fails earlier on missing Docker, missing Compose support, Windows-containers mode, missing default browser handler for auto-open runs, unwritable repo `data/` paths, and low disk headroom; local GPU tooling still stays a warning unless `-AiStack local-gpu` is selected
  - shared PowerShell helpers in `scripts/lib/shared.ps1` now own writable-directory probing and free-space lookups for reuse by later launcher and packaging tasks
  - disk-headroom policy for both launcher and runtime preflight is `warning` below 2 GB free and `blocker` below 512 MB free on the app-data drive
  - validation completed on 2026-03-08 with `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/server/host-preflight.test.ts`, `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`, a manual writable-path smoke using `scripts/lib/shared.ps1`, and a manual missing-Docker smoke via a temporary `PATH` override
  - the launcher validation again exercised the existing host `3000` conflict on this machine and correctly fell back to `3100`

### T35 - Packaging Prototype And Decision Memo

- Status: Done
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
  - selected Electron as the packaging spike direction because it can wrap the existing compiled Node plus browser stack without introducing a Rust toolchain or splitting gameplay authority
  - added `packaging/decision-memo.md` with the comparison against launcher-only and Tauri, save or log implications, an env-file strategy, and a clean-machine Windows smoke checklist for T36
  - added an Electron prototype shell under `packaging/electron/` that stages runtime files into a writable user-data area, starts `dist/server.js` via `ELECTRON_RUN_AS_NODE=1`, waits for `/api/state`, and then opens the existing player UI in a native window
  - added package scripts plus a Windows wrapper script at `scripts/start-desktop-prototype.ps1` for the prototype path
  - bumped `better-sqlite3` to `^12.6.2` so Electron rebuilds can complete during packaging; the previous `^9.4.0` line failed against Electron 36 headers
  - updated `ROADMAP.md`, `ARCHITECTURE.md`, and `README.md` to record the packaging direction and current prototype caveats
  - fixed the desktop shell bootstrap on 2026-03-08 by moving the Electron main-process entrypoint to CommonJS at `packaging/electron/main.cjs`; the prior ESM entry hit Electron loader issues in the host validation environment
  - fixed packaged runtime staging on 2026-03-08 by copying `package.json` and linking packaged `node_modules` into the writable runtime folder so the staged `dist/server.js` can resolve ESM dependencies like `dotenv`
  - hardened `scripts/start-desktop-prototype.ps1` on 2026-03-08 to clear inherited `ELECTRON_RUN_AS_NODE` before launching Electron; this shell environment had that variable set globally, which otherwise caused Electron to behave like plain Node
  - validated on 2026-03-08 with `docker compose build app` and `docker compose run --rm app npm run desktop:prototype:dir`; the Electron builder path completed in-container after rebuilding native dependencies for Electron
  - host Windows validation completed on 2026-03-08 from a clean temp copy with official Node `v22.22.1`: `npm run type-check`, `npm run desktop:prototype:dir`, direct launch of `packaging/out/electron/win-unpacked/Text Game Prototype.exe`, packaged preflight check with a missing API key, and `powershell -ExecutionPolicy Bypass -File scripts/start-desktop-prototype.ps1`
  - the unpacked Windows shell created `%APPDATA%\\text-game\\runtime\\data\\game.db` and `%APPDATA%\\text-game\\logs\\desktop-shell.log`, read `.env` beside the executable, kept save data out of the install directory, preserved the same DB across restart, and exercised fallback port selection to `3002` on this machine because lower ports were already busy

### T35a - Packaged AI Runtime Decision For Docker LiteLLM

- Status: Done
- Queue: Next
- Phase: P0
- Priority: P1
- Owner Role: Release lead
- Goal: Lock how the Windows launcher and packaged build relate to the repo-managed LiteLLM Docker sidecar and its optional GPU override.
- Scope:
  - decide whether the MVP packaged path requires Docker Desktop as a prerequisite or stages LiteLLM differently while keeping the same app-facing contract
  - document how the launcher, setup flow, and packaged shell should detect and explain missing Docker, missing LiteLLM readiness, and unsupported GPU prerequisites
  - update the packaging decision memo and roadmap notes so T36 inherits one explicit AI-runtime contract
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - README.md
  - packaging/decision-memo.md
- Do Not Touch:
  - src/
  - public/
  - data/spec/
- Dependencies:
  - T35
  - T02f
- Validation:
  - decision memo review
  - clean-machine checklist update review
- Definition of Done:
  - the supported packaged path clearly states whether Docker Desktop is required for MVP AI startup
  - launcher and packaged-path prerequisite messaging covers Docker and optional GPU failures in plain language
  - T36 no longer has to infer how LiteLLM is expected to start in the playtest build
- Handoff Notes:
  - user directed on 2026-03-08 that LiteLLM should default to the repo-managed Docker path with GPU-capable support available
  - keep the app-facing contract stable at `game-chat` and `game-embedding` even if the packaged runtime eventually stops using Docker internally
  - treat hosted-first startup as the default supported path and the GPU-backed local model route as an explicit opt-in
  - locked D06 on 2026-03-08: the MVP packaged playtest path requires Docker Desktop for AI startup and reuses the repo-managed LiteLLM sidecar instead of bundling LiteLLM or Ollama into the Electron shell
  - the packaged shell remains responsible for the app window plus compiled local server only; AI startup stays external so T36 can reuse the same app-facing gateway contract and recovery language as the launcher
  - plain-language prerequisite messaging now needs to distinguish three cases for T36 and T12b: Docker Desktop missing or not running, LiteLLM sidecar not ready, and optional local GPU prerequisites missing for the `local-gpu` path
  - hosted-first remains the default supported packaged route; the local GPU path stays an explicit opt-in that requires Docker Desktop, WSL2 backend support, compatible NVIDIA drivers, and a supported GPU-capable host
  - validation for this decision slice was a doc review of `packaging/decision-memo.md`, `README.md`, and `ROADMAP.md` to ensure the packaged AI contract, prerequisite wording, and clean-machine checklist all agree

### T02g - GPU Tier Matrix And Local Model Profiles

- Status: Ready
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

### T02h - Auto-Select Local GPU Model Profile

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Let the launcher and setup flow detect local GPU capability and auto-select a compatible local model profile for the LiteLLM GPU path.
- Scope:
  - start by adding or tightening a deterministic fixture or scripted harness step for GPU profile selection before implementation
  - detect local GPU memory or consume a manual override when auto-detection is unavailable
  - choose the local chat-model profile from the T02g matrix and apply the matching LiteLLM local-GPU config path
  - show the selected profile, allow user override, and explain when the detected tier may still be too small
- Files to Touch:
  - BACKLOG.md
  - README.md
  - setup_local_a.i.md
  - .env.example
  - scripts/start-dev.ps1
  - scripts/test-local-ai-workflow.ps1
  - src/config.ts
  - src/config.test.ts
  - src/server.ts
  - public/app.ts
  - public/index.html
  - litellm.local-gpu.config.yaml
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T02g
  - T02j
  - T12b
- Validation:
  - `npm run type-check`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`
  - manual local GPU startup check
- Definition of Done:
  - the launcher or setup flow can select a local model profile from detected VRAM tiers or an explicit user override
  - the selected profile is surfaced in plain language before gameplay starts
  - unsupported or ambiguous hardware falls back to guided manual selection instead of silent failure
  - the AI test harness covers the profile-selection behavior that was added first
- Handoff Notes:
  - keep hosted-first LiteLLM as the default path; this task only improves the optional local GPU route
  - prefer conservative selection over aggressive maximum-size choices because startup reliability matters more than squeezing the largest possible model onto the card
  - the first implementation can target NVIDIA on Windows through Docker Desktop and WSL2 before expanding the detection story

### T02i - AI Readiness, Network, And Model-Availability Probes

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: AI systems lead
- Goal: Catch AI-stack failures before the first turn by probing LiteLLM health, network reachability, aliases, upstream auth, and required local model availability.
- Scope:
  - verify LiteLLM readiness, required alias existence, and upstream connectivity separately so failures are specific
  - detect common DNS, TLS, proxy, credential, and rate-limit style failures and convert them into preflight issues with end-user-safe wording
  - for the optional local GPU path, verify whether the selected local model is installed or can be pulled, rather than failing only at first generation time
  - surface non-blocking performance warnings such as CPU fallback, undersized VRAM, or likely slow local inference separately from true blockers
- Files to Touch:
  - BACKLOG.md
  - README.md
  - scripts/start-dev.ps1
  - src/server/runtime-preflight.ts
  - src/server/runtime-preflight.test.ts
  - src/core/config.ts
  - src/ui/app.ts
  - setup_local_a.i.md
  - litellm.local-gpu.config.yaml
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T01b
  - T02f
- Validation:
  - manual LiteLLM readiness probe
  - manual unreachable-network and missing-model smoke checks
- Definition of Done:
  - startup can distinguish LiteLLM-not-ready, alias-missing, upstream-auth-failed, and local-model-missing cases
  - common network failures are mapped to plain-language recovery steps
  - likely performance problems appear as warnings instead of silent degradation
  - the first turn is blocked only when the selected AI path cannot reasonably succeed
- Handoff Notes:
  - keep messages provider-neutral where possible, but be specific about the failing layer
  - prefer separate probes over one catch-all AI health error because supportability matters here
  - added `src/server/runtime-preflight.test.ts` first so runtime preflight now has focused coverage for three AI-specific startup cases before implementation changes: LiteLLM proxy-auth mismatch, upstream auth failure behind LiteLLM, and missing local model detection
  - runtime preflight now probes LiteLLM `/models` for alias exposure and LiteLLM `/health` for upstream route health, then classifies proxy-auth mismatch, proxy auth rejection, upstream auth failure, DNS failure, TLS failure, local-backend reachability, and missing local-model cases separately
  - trimmed LiteLLM health diagnostics down to short support notes so advanced details stay actionable without dumping full stack traces into the browser debug payload
  - updated `src/ui/app.ts` so `action-required` really disables turn submission and renders as setup-blocked instead of treating only the older `blocked` label as fatal
  - updated `scripts/start-dev.ps1` so the existing local-GPU host warning now explicitly tells users that missing GPU tooling can lead to very slow CPU fallback, not just startup failure
  - updated `README.md` and `setup_local_a.i.md` so the new recovery paths for LiteLLM proxy auth, upstream credentials, missing local models, and slow local-GPU fallback are documented
  - validated on 2026-03-08 with `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/server/runtime-preflight.test.ts`, and `docker compose run --rm --no-deps app npm test`
  - manual runtime validation on 2026-03-08 covered four cases:
    - default Compose LiteLLM startup with no `LITELLM_MASTER_KEY`, where `/api/state` now reports `litellm_proxy_auth_misconfigured` instead of a generic endpoint failure
    - Compose LiteLLM startup with `LITELLM_MASTER_KEY=anything` and the default placeholder upstream key, where `/api/state` now reports `ai_upstream_auth_failed`
    - a one-off app container pointed at `http://does-not-resolve.invalid:4011`, where runtime preflight now reports `ai_dns_lookup_failed`
    - a one-off app container pointed at a temporary host stub that returned a LiteLLM-style `/models` + `/health` payload for a missing Ollama model, where runtime preflight now reports `local_model_missing`
  - launcher smoke validation on 2026-03-08 used `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`; this machine still had an unrelated `wslrelay` listener on port `3000`, so the launcher correctly fell back to `3100`

### T02j - End-User Config Profiles And Validated Developer Overrides

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Give end users a few safe startup profiles while still letting developers override the underlying config with validation and clear diagnostics.
- Scope:
  - define supported end-user profiles such as hosted default, local GPU small, local GPU medium or large, and custom
  - validate manual overrides against the same config contract so advanced users can change behavior without bypassing preflight
  - show which values came from the selected profile and which came from explicit overrides
  - keep the profile system provider-neutral internally even when LiteLLM is the default surface
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - README.md
  - .env.example
  - src/config.ts
  - src/config.test.ts
  - public/app.ts
  - public/index.html
  - scripts/start-dev.ps1
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T01b
  - T02a
  - T02g
- Validation:
  - `npm test`
  - manual profile resolution check
- Definition of Done:
  - end users can choose from a small number of safe startup profiles without editing raw env vars
  - developer overrides remain possible but validated and visible in diagnostics
  - the runtime can explain which values come from defaults, profiles, and explicit overrides
  - the profile system does not create a second hidden config path outside the main contract
- Handoff Notes:
  - the main value here is reducing blank-slate config ambiguity, not adding endless profile permutations
  - keep the end-user surface small and move complexity behind the advanced override path

### T02 - Config Module With Schema Validation

- Status: Done
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
  - follow-on LiteLLM work should now treat LiteLLM as the default AI control plane, keep `game-chat` and `game-embedding` as the default aliases, and treat legacy `OPENAI_*` env vars as transitional compatibility only
  - started centralizing provider-aware env precedence in `src/config.ts` so server preflight can reuse the same env-var contract instead of duplicating it
  - validated this config-contract slice on 2026-03-08 with `docker compose build app`, `docker compose run --rm app npm run type-check`, and `docker compose run --rm app npm test`
  - added safe config diagnostics for runtime debug and startup logging so callers can see whether values came from provider-specific, generic, legacy, or default sources without exposing secret values
  - added a focused `npm run test:config` path so future config changes can validate the contract without waiting on the full suite
  - final validation on 2026-03-08 re-ran `docker compose build app`, `docker compose run --rm app npm run test:config`, and `docker compose run --rm app npm test`
  - manual startup validation on 2026-03-08 covered a syntactically valid Ollama config on port `3310`, where `/api/state` exposed `config_diagnostics` and startup logs showed the safe source summary while runtime preflight remained blocked only on the returned embedding model alias, not config parsing
  - manual startup validation on 2026-03-08 also covered an invalid OpenAI-compatible config on port `3311`, where startup logs immediately printed the missing-key and invalid-URL errors and `/api/state` returned matching blocked preflight issues plus safe config diagnostics

### T02a - LiteLLM Env Contract And Alias Defaults

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make LiteLLM the default runtime config contract so all AI paths share one gateway-first setup.
- Scope:
  - switch the default template and docs to LiteLLM-first configuration
  - lock `game-chat` and `game-embedding` as the default alias names for the current MVP path
  - mark legacy `OPENAI_*` env vars as transitional compatibility rather than the preferred setup path
  - keep the config module provider-neutral internally while making the gateway-first path obvious to users
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - .env.example
  - src/config.ts
  - src/config.test.ts
  - scripts/start-dev.ps1
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T02
- Validation:
  - manual config verification
  - `npm test`
- Definition of Done:
  - LiteLLM is the default documented env path for app setup
  - `game-chat` and `game-embedding` are the locked default aliases in code and docs
  - legacy `OPENAI_*` support remains functional but is clearly transitional in repo docs
  - config behavior and docs agree on the same precedence and preferred setup path
- Handoff Notes:
  - user confirmed on 2026-03-08 that LiteLLM should manage all AI by default
  - user confirmed the default aliases should stay `game-chat` and `game-embedding`
  - user confirmed legacy `OPENAI_*` env vars are transition-only, not the long-term preferred interface
  - default blank-slate config now resolves to LiteLLM while older direct-provider envs still infer `openai-compatible` and Ollama-specific envs still infer `ollama`
  - updated `.env.example`, `README.md`, `REQUIREMENTS.md`, and `scripts/start-dev.ps1` so the default documented and launcher-adjacent path now matches the LiteLLM-first contract
  - validated on 2026-03-08 with `docker compose build app`, `docker compose run --rm app npm run test:config`, and `docker compose run --rm app npm test`
  - manual config verification on 2026-03-08 covered a no-env container on port `3312`, which defaulted to `litellm` with `game-chat`, `game-embedding`, and `http://127.0.0.1:4000`, plus a legacy `OPENAI_*`-only container on port `3313`, which inferred `openai-compatible` with legacy model values and surfaced `provider.source = inferred`
  - closeout fix on 2026-03-08 aligned `scripts/start-dev.ps1` base-URL lookup with `src/config.ts` precedence so `OPENAI_BASE_URL` remains a functional transitional fallback for `openai-compatible`, `litellm`, and `ollama` launcher resolution
  - final closeout validation on 2026-03-08 re-ran `docker compose run --rm app npm test` and a focused launcher regression check with session `AI_PROVIDER=openai-compatible` plus only `OPENAI_BASE_URL=http://127.0.0.1:4011`, which now fails fast at that configured URL instead of silently ignoring the legacy fallback

### T02b - LiteLLM Proxy Template And Startup Docs

- Status: Review
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make the Docker-backed LiteLLM gateway path easy to start and understand without requiring guesswork or README archaeology.
- Scope:
  - tighten the LiteLLM proxy template around the locked default aliases
  - document the repo-managed Docker sidecar as the supported startup path, with external host proxies treated as advanced overrides
  - update startup docs to present LiteLLM as the default control plane for both hosted and optional local-model paths
  - explain the hosted-provider-first path for small helper tasks such as autocomplete and spellcheck
  - document the optional large local-model path through Ollama or another external AI agent behind the same gateway-oriented UX
- Files to Touch:
  - BACKLOG.md
  - README.md
  - litellm.config.yaml
  - .env.example
  - setup_local_a.i.md
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T02a
- Validation:
  - manual LiteLLM startup verification through Docker
- Definition of Done:
  - LiteLLM startup docs match the default env template, alias contract, and repo-managed Docker sidecar flow
  - the docs explain hosted small-task routing versus optional large local-model routing in plain language
  - the gateway template is usable without reverse-engineering repo conventions
- Handoff Notes:
  - user confirmed on 2026-03-08 that small AI helper tasks should prefer hosted providers
  - user confirmed on 2026-03-08 that larger optional generation can use a local model such as Ollama or an external AI agent
  - keep the player-facing explanation UI-first and avoid turning this into an API-first setup workflow yet
  - updated `litellm.config.yaml` to make `game-chat` and `game-embedding` the explicit stable alias contract, with hosted-first guidance and notes for optional local upstream swaps behind the same aliases
  - updated `.env.example` so the app-facing LiteLLM vars, the proxy-side template vars, and the optional direct-provider fallbacks are clearly separated
  - refreshed `README.md` with a clearer LiteLLM startup path, explicit hosted-first guidance for helper tasks and embeddings, and a gateway-aligned optional local-model story
  - refreshed `setup_local_a.i.md` so Windows local-model guidance now starts from the LiteLLM path first and keeps the older direct `AI_PROVIDER=ollama` route as a smoke-test fallback
  - manual LiteLLM startup verification is still pending; this session focused on tightening the template and docs so the gateway path is easier to follow before the next runtime check

### T02f - Docker-First LiteLLM Sidecar And GPU Override

- Status: Review
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make Docker the default LiteLLM startup path while keeping a clean developer override for optional local GPU-backed inference.
- Scope:
  - add a LiteLLM sidecar service to the default Compose runtime so the app no longer expects a separately started host proxy by default
  - add an optional Compose override for a local inference backend with NVIDIA GPU passthrough on Windows via Docker Desktop and WSL2
  - update the Windows launcher so hosted-default remains simple while developers can opt into the local GPU override without editing multiple files
  - refresh env templates and docs so the supported Docker-first path and the optional GPU path are both clear
- Files to Touch:
  - BACKLOG.md
  - Dockerfile.litellm
  - docker-compose.yml
  - docker-compose.gpu.yml
  - .env.example
  - README.md
  - litellm.config.yaml
  - litellm.local-gpu.config.yaml
  - setup_local_a.i.md
  - scripts/start-dev.ps1
- Do Not Touch:
  - src/
  - public/
  - data/spec/
- Dependencies:
  - T02a
  - T02b
- Validation:
  - `docker compose up --build`
  - `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
- Definition of Done:
  - default Docker startup brings up both the app and LiteLLM without a separate manual proxy step
  - developers can opt into a local GPU-backed model path through one extra Compose override or launcher option
  - GPU passthrough is documented and wired only to the local inference container that needs it
  - app-facing aliases remain `game-chat` and `game-embedding` across both modes
- Handoff Notes:
  - user explicitly assigned implementation on 2026-03-08 after confirming a Docker-first default, easy developer overrides, and GPU passthrough support
  - treat NVIDIA on Docker Desktop and WSL2 as the first officially supported GPU path for the optional local inference override
  - implemented a repo-owned LiteLLM sidecar image in `Dockerfile.litellm` so startup no longer depends on fragile single-file bind mounts from the `G:` workspace drive
  - default `docker-compose.yml` now starts the app plus LiteLLM sidecar, and `docker-compose.gpu.yml` adds an optional Ollama backend with Docker GPU reservations
  - `scripts/start-dev.ps1` now supports `-AiStack hosted` and `-AiStack local-gpu`; both launcher modes force the supported LiteLLM stack instead of inheriting stale direct-provider `.env` experiments
  - validated on 2026-03-08 with `docker compose config`, `docker compose -f docker-compose.yml -f docker-compose.gpu.yml config`, `$env:PORT='3300'; docker compose up --build -d`, `Invoke-WebRequest http://127.0.0.1:3300/api/state?name=ComposeSmoke`, `$env:PORT='3301'; powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`, `$env:PORT='3302'; docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build`, `Invoke-WebRequest http://127.0.0.1:3302/api/state?name=GpuSmoke`, and `$env:PORT='3303'; powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -AiStack local-gpu -NoBrowser`
  - current limitation: without a real hosted provider key, runtime preflight still reports the AI service as blocked before the first turn because LiteLLM returns HTTP 400 during the app's startup connectivity probe; container startup and launcher orchestration are verified, but real turn-generation validation still needs a valid upstream credential

### T03 - Logging With Levels And Redaction

- Status: Done
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
  - src/server/index.ts
  - src/core/config.ts
  - src/core/config.test.ts
  - src/core/config/env.ts
  - src/core/config/validation.ts
  - src/core/types.ts
  - src/core/logging.ts
  - src/core/logging.test.ts
  - docker-compose.yml
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
  - added `src/core/logging.ts` plus `src/core/logging.test.ts` so the server now has one shared structured logger with four levels (`debug`, `info`, `warn`, `error`), child request context, and recursive redaction for common secret fields such as `authorization`, `apiKey`, `token`, `password`, `cookie`, and `secret`
  - added `LOG_LEVEL` parsing and validation in config so log verbosity can be changed without code edits; unsupported values now fall back to `info` and surface `invalid_log_level` in config validation
  - `src/server/index.ts` now emits consistent JSON log lines for startup state, config-source resolution, request start and finish, reload failures, turn validation failures, and turn exceptions without logging request bodies or prompt text
  - `docker-compose.yml` now passes `LOG_LEVEL` through to the app container so the supported Docker path can actually enable debug logging
  - updated `README.md` to document `LOG_LEVEL`, the structured JSON log shape, and the redaction contract
  - validated on 2026-03-08 with `docker compose run --rm --no-deps app npx tsx --test src/core/logging.test.ts src/core/config.test.ts` and `docker compose run --rm --no-deps app npm test`
  - manual request smoke on 2026-03-08 used `$env:PORT='3301'; $env:LOG_LEVEL='debug'; docker compose up -d --build app`, `Invoke-WebRequest http://127.0.0.1:3301/api/state?name=LoggerSmoke` with `x-request-id=manual-log-smoke`, and `docker logs --tail 20 text-game-app-1`; the app emitted structured JSON lines for startup plus `request started` and `request finished` with request id, method, route, status code, and duration
  - remaining unstructured or external output to clean up later: Node deprecation warnings from dependencies and logs emitted by the separate LiteLLM container are still outside the app logger

### T04 - DB Migrations And Seed Flow

- Status: Done
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
  - src/core/db.ts
  - package.json
  - docker-compose.yml
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
  - refactored `src/core/db.ts` into an explicit migration runner with a `schema_migrations` table, two baseline migrations (`001_initial_schema`, `002_memory_embeddings_and_indexes`), lazy DB open, and CLI commands for `migrate` and `reset`
  - `npm run db:migrate` and `npm run db:reset` now compile the server and invoke the DB CLI through `dist/core/db.js` so the same flow works in Docker and on host builds
  - added `GAME_DATA_DIR` and `GAME_DB_PATH` support in `src/core/db.ts`; the supported Docker path now sets `GAME_DATA_DIR=/data` in `docker-compose.yml` so resets and restarts operate on the persisted runtime volume instead of the image workspace
  - updated `README.md` with explicit local and Docker commands for migrate versus reset, plus restart guidance after a reset
  - validation on 2026-03-08 ran `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npm test`, and a manual DB reset-and-restart smoke
  - manual DB reset-and-restart smoke on 2026-03-08 used `$env:PORT='3304'; docker compose run --rm --no-deps app npm run db:reset`, `docker compose up -d --build app`, `Invoke-WebRequest http://127.0.0.1:3304/api/state?name=ResetSmoke`, and a `docker exec text-game-app-1` SQLite check that confirmed `schema_migrations` contained `001_initial_schema` and `002_memory_embeddings_and_indexes`
  - current baseline assumption for future migrations: keep migration functions idempotent so older worktrees or partially-initialized local DBs can be baselined safely before stricter versioned migrations arrive

### T04a - Storage, Save, And Migration Preflight

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Catch save, DB, and writable-storage failures before a player loses progress or hits a migration error mid-session.
- Scope:
  - check writable save, DB, and log locations before gameplay starts
  - warn or block on low free disk, unreadable existing DB files, incompatible save schema, or corrupted save metadata
  - verify backup or recovery behavior around migrations and reset flows
  - expose storage and save health through the shared preflight contract and startup UI
- Files to Touch:
  - BACKLOG.md
  - README.md
  - src/db.ts
  - src/server.ts
  - public/app.ts
  - public/index.html
  - scripts/start-dev.ps1
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T04
  - T01b
- Validation:
  - manual DB and save preflight smoke test
  - manual incompatible-save or unwritable-path check
- Definition of Done:
  - players are warned before a broken save or unwritable path causes data loss
  - migration-sensitive failures surface before the first turn or before load
  - save-path health is visible without requiring a terminal or direct file browsing
  - the launcher and in-app setup flow agree on storage-related blockers
- Handoff Notes:
  - classify actual write-risk issues as blockers
  - save compatibility messaging should stay readable to non-developers even when schema versions are involved

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
  - user clarified on 2026-03-08 that Ollama or another local model is an optional larger-model path, not the default small-task setup
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
| D01 | Concrete default numeric budgets for latency, token use, cost, and DB growth in the configurable budget file | Phase 0 exit | Tech lead | Locked |
| D02 | Director spec format: JSON or YAML | Before T16 starts | Gameplay systems lead | Open |
| D03 | Sample MVP quest or story arc definition | Before Phase 1 exit | Product/UI lead | Open |
| D04 | MVP packaging shell: launcher-only, Tauri, or Electron | Before Phase 0 exit | Release lead | Locked |
| D05 | Default end-user AI setup: repo-managed LiteLLM Docker sidecar as the default control plane, with hosted small-task routing and an optional GPU-backed local-model path | Before Phase 0 exit | Tech lead | Locked |
| D06 | MVP packaged AI runtime: require Docker Desktop for the LiteLLM sidecar, or stage the gateway another way while preserving the same app-facing contract | Before T36 starts | Release lead | Locked |
| D07 | Initial local GPU tier matrix: which VRAM tiers are officially supported first, and which model profiles map to them | Before T02h starts | AI systems lead | Open |
| D08 | Preflight policy: which startup failures are blockers versus warnings versus info in end-user mode, and which actions can auto-fix safely | Before T01b starts | Tech lead | Open |

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
