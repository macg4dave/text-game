# SunRay Backlog

This document is the AI-facing execution board for the `SunRay` launcher work. It is optimized for coding agents and humans working through small, verifiable tasks while keeping the Rust launcher migration isolated from the main project backlog.

If this file and [BACKLOG.md](/g:/text-game/BACKLOG.md) disagree on `SunRay` execution detail, this file is the execution source of truth for `SunRay` work. The main backlog remains the source for broader project sequencing outside the launcher migration.

Use [BACKLOG.md](/g:/text-game/BACKLOG.md) for `SunRay` work only when the main project backlog needs a blocker, dependency, or high-level coordination note. Keep all detailed `SunRay` tasks, validation state, handoff notes, and migration slices in this file.

The `SunRay` migration is scoped to replacing the current automation scripts. It does not authorize rewriting Docker, Electron, the installer path, or the Node or TypeScript gameplay runtime.

## How Agents Must Use This File

1. Read [ROADMAP.md](/g:/text-game/ROADMAP.md), [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md), [ARCHITECTURE.md](/g:/text-game/ARCHITECTURE.md), and this file before starting substantial `SunRay` work.
2. Choose work from the queue table below by selecting a row with `Status` = `Ready` unless the user explicitly assigns a different `SunRay` task.
3. Claim exactly one task card by changing its `Status` from `Ready` to `In Progress`.
4. Do only the work described in that task card unless a blocking dependency forces a documented expansion.
5. Run the listed validation commands before marking the task complete.
6. Update the task card, the queue table, and any affected docs before ending the session.
7. If blocked, change the task to `Blocked` and add a one-line blocker note.
8. Preserve the parity-and-deletion rule: each legacy script must first reach behavior parity in `launcher/SunRay`, then that legacy script must be deleted before the migration slice can be marked complete.
9. Keep `SunRay` inside its boundary: it is not a webview shell, installer, updater, package manager, Electron replacement, or rewrite of the app runtime.
10. If broader project coordination is needed, add only the smallest blocker or dependency note to [BACKLOG.md](/g:/text-game/BACKLOG.md) and keep the implementation detail here.

## Status Model

- `Ready`: fully specified and safe for an agent to start once listed dependencies are satisfied
- `In Progress`: currently being worked by one agent
- `Blocked`: cannot proceed because a dependency, decision, or missing context prevents safe execution
- `Review`: implementation is done and awaits human or follow-up agent review
- `Done`: validated and fully handed off
- `Dropped`: intentionally removed from scope

## Queue Model

- `Now`: should be worked in the current migration slice
- `Next`: can be prepared now but should not be started until `Now` work is stable
- `Later`: intentionally deferred

## SunRay Boundary Rules

- `SunRay` is a Rust launcher and harness runtime rooted at `launcher/`.
- `SunRay` may orchestrate Docker, npm, Node, browser launch, and Electron prototype commands.
- `SunRay` is not a webview shell.
- `SunRay` is not an installer.
- `SunRay` is not an updater.
- `SunRay` is not a package manager.
- `SunRay` is not a replacement for Electron packaging.
- `SunRay` is not a replacement for the Node server or the TypeScript gameplay stack.
- If a responsibility would turn `SunRay` into a second app runtime instead of an automation entrypoint, it belongs elsewhere.

## Migration Rules

- Migrate one legacy script at a time.
- Match existing behavior in `SunRay` before deleting the old script.
- Delete the migrated legacy script in the same task that validates parity, not later as cleanup debt.
- Do not add new `.ps1`, `.sh`, `.bat`, or similar shell entrypoints for launcher work.
- Shared automation behavior should live in Rust modules under `launcher/`.

## Task Card Templates

Use one of the exact shapes below when adding new work.

### Standalone Or Child Task Template

```md
### T00 - Short Task Name

- Status: Ready
- Queue: Now
- Phase: P1
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
  - cargo test
  - cargo check
- Definition of Done:
  - observable completion condition 1
  - observable completion condition 2
- Handoff Notes:
  - what the next agent should know
```

### Parent Issue Template

```md
### T00 - Short Parent Issue Name

- Status: Ready
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: One-sentence description of the multi-step outcome.
- Scope:
  - concrete outcome 1
  - concrete outcome 2
- Files to Touch:
  - path/to/doc-or-system-area
- Do Not Touch:
  - path/to/protected-area
- Dependencies:
  - T00x
- Child Tasks:
  - T00a
  - T00b
- Validation:
  - manual doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - the parent issue is decomposed into implementation-ready child tasks
  - affected planning docs are synchronized for the issue
- Handoff Notes:
  - sequencing, blockers, or open decisions the next agent should know
```

## Ready Queue

This table is the full `SunRay` execution board. Only rows with `Status` = `Ready` are startable without additional backlog work unless a global blocker note below says otherwise.

Global blocker as of 2026-03-09:

- `T65` blocks all non-`T65*` `SunRay` implementation work.
- `T65` follows a strict parity-and-deletion rule: each legacy script must first reach behavior parity in `launcher/SunRay`, then that legacy script must be deleted before the next migration slice is considered complete.

| ID | Queue | Phase | Priority | Task | Status | Depends On | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T65 | Now | P1 | P1 | Rust script-runtime migration | In Progress | None | Manual planning-doc consistency review + child task validation |
| T65a | Now | P1 | P1 | SunRay workspace and command contract | Done | T65 | `cargo check --manifest-path launcher/Cargo.toml` + `cargo test --manifest-path launcher/Cargo.toml` + manual command-surface review |
| T65b | Now | P1 | P1 | SunRay launcher and preflight parity | Done | T65a | `cargo run --manifest-path launcher/Cargo.toml -- start-dev --no-browser` |
| T65c | Now | P1 | P1 | SunRay local AI workflow harness migration | Review | T65a | `cargo run --manifest-path launcher/Cargo.toml -- test-local-ai-workflow --selection-only` + local provider smoke when available |
| T65d | Now | P1 | P1 | SunRay validator command migration | Review | T65a | `cargo run --manifest-path launcher/Cargo.toml -- validate-local-gpu-profile-matrix` + `cargo run --manifest-path launcher/Cargo.toml -- validate-litellm-default-config` |
| T65e | Now | P1 | P1 | SunRay setup smoke and desktop wrapper migration | Review | T65a, T65b | `cargo run --manifest-path launcher/Cargo.toml -- test-setup-browser-smoke` + `cargo run --manifest-path launcher/Cargo.toml -- start-desktop-prototype` |
| T65f | Now | P1 | P1 | Shell reference cleanup and script deletion | Blocked | T65b, T65c, T65d, T65e | `cargo test --manifest-path launcher/Cargo.toml` + manual doc and launcher-copy consistency review |
| T65g | Now | P1 | P2 | SunRay Copilot prompt scaffolding | Done | T65 | Manual instruction and prompt-file consistency review |

## Task Cards

### T65 - Rust Script-Runtime Migration

- Status: In Progress
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Replace every current PowerShell-owned automation path in `scripts/` with the Rust launcher executable `SunRay` under `launcher/`.
- Scope:
  - define `launcher/` as the home of the Rust crate and `SunRay` executable that absorbs the current launcher, harness, smoke-test, validation, and desktop-wrapper responsibilities now implemented as `.ps1`
  - keep Docker, Electron, Node, npm, and TypeScript validation code as invoked dependencies where appropriate instead of rewriting those runtimes in this issue
  - migrate one legacy script at a time by first matching behavior in `SunRay` and then deleting that script before the child task can close
  - retire the PowerShell script-library direction and remove shell-based automation as an accepted execution path for new work
  - keep the launcher boundary strict so `SunRay` does not drift into a webview shell, installer, package manager, updater, or alternate app runtime
  - update repo rules, docs, package entrypoints, and launcher-copy references so the Rust tooling contract becomes the only supported direction
- Files to Touch:
  - sunray_backlog.md
  - ROADMAP.md
  - ENGINEERING_STANDARDS.md
  - ARCHITECTURE.md
  - README.md
  - package.json
  - launcher/
  - scripts/
  - src/server/
  - src/ui/
- Do Not Touch:
  - docker-compose.yml
  - docker-compose.gpu.yml
  - packaging/electron/
  - src/state/
  - src/story/
- Dependencies:
  - None
- Child Tasks:
  - T65a
  - T65b
  - T65c
  - T65d
  - T65e
  - T65f
- Validation:
  - Manual planning-doc consistency review
  - Child task validation listed on each child card
- Definition of Done:
  - the parent issue is decomposed into implementation-ready child tasks
  - affected planning docs are synchronized for the Rust-only launcher direction
  - the parity-then-delete migration rule is explicit in the backlog and supporting rules
  - all legacy launcher-related scripts covered by this issue are deleted after parity validation
- Handoff Notes:
  - the Rust executable lives under `launcher/` and is named `SunRay`
  - scope is limited to what `scripts/` currently does; do not treat this issue as approval to replace Docker, Electron, or the Node app runtime
  - `SunRay` is not a webview shell, not an installer, not an updater, not a package manager, not a replacement for Electron, and not a rewrite of the app server

### T65a - SunRay Workspace And Command Contract

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Establish the `launcher/` Rust crate for the `SunRay` executable with one command surface that maps cleanly to every current PowerShell entrypoint.
- Scope:
  - add the Rust crate and dependency structure rooted at `launcher/Cargo.toml`
  - reserve `launcher/` as the only home for the `SunRay` executable and its shared Rust modules
  - define subcommands for `start-dev`, `test-local-ai-workflow`, `test-setup-browser-smoke`, `validate-local-gpu-profile-matrix`, `validate-litellm-default-config`, and `start-desktop-prototype`
  - add shared Rust modules for process execution, env loading, logging, error shaping, and reusable config or probe helpers
  - document the command mapping, parity-then-delete migration rule, and `SunRay` non-goals without claiming the old `.ps1` files are still the desired architecture
- Files to Touch:
  - sunray_backlog.md
  - README.md
  - package.json
  - launcher/
  - scripts/
- Do Not Touch:
  - src/server/
  - src/ui/
  - docker-compose.yml
  - docker-compose.gpu.yml
  - packaging/electron/
- Dependencies:
  - T65
- Validation:
  - `cargo check --manifest-path launcher/Cargo.toml`
  - `cargo test --manifest-path launcher/Cargo.toml`
  - Manual review of the Rust command surface and its mapping to the current `.ps1` inventory
- Definition of Done:
  - `launcher/` contains the `SunRay` Rust crate with a stable top-level command surface
  - new automation work no longer requires adding `.ps1`, `.bat`, or `.sh` entrypoints
  - shared automation logic has one Rust-owned home instead of another shell helper bucket
  - the repo records what `SunRay` is not before implementation details start sprawling
- Handoff Notes:
  - prefer preserving the current command names as Rust subcommands so later doc and UI-copy updates stay mechanical
  - temporary legacy `.ps1` wrappers may exist during the migration, but no new behavior should be added to them
  - completed on 2026-03-09 by turning `launcher/` into a real Cargo-backed CLI scaffold with one `SunRay` binary, parity-focused subcommands, shared Rust modules for config/env/logging/error/process concerns, and launcher docs that map every legacy `.ps1` entrypoint to its owning `T65*` slice
  - `package.json` now exposes `sunray`, `sunray:check`, `sunray:test`, and one npm convenience script per planned subcommand without claiming parity is already implemented
  - validation on 2026-03-09 ran `cargo check --manifest-path launcher/Cargo.toml`, `cargo test --manifest-path launcher/Cargo.toml`, and manual command-surface review via `cargo run --manifest-path launcher/Cargo.toml -- --help` plus `cargo run --manifest-path launcher/Cargo.toml -- start-dev --no-browser`
  - Windows note: the workspace `launcher/target` directory on `G:` returned `Access is denied (os error 5)` for Cargo execution in this session, so validation succeeded by setting `CARGO_TARGET_DIR` to a temp path; keep that workaround in mind if the permission issue repeats

### T65b - SunRay Launcher And Preflight Parity

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Move the current Windows launcher and its preflight or Docker orchestration behavior into `SunRay` without changing the supported Docker path itself.
- Scope:
  - replace `scripts/start-dev.ps1` behavior in Rust, including dotenv loading, Docker checks, GPU detection, port resolution, app readiness polling, and browser launch
  - migrate reusable launcher concerns currently spread across `scripts/lib/*.ps1` into focused Rust modules
  - preserve the current blocker, warning, and info recovery language unless a deliberate launcher-copy update is part of the migration
  - keep the launcher invoking Docker Compose and the existing app runtime rather than reimplementing container behavior
- Files to Touch:
  - sunray_backlog.md
  - README.md
  - package.json
  - launcher/
  - scripts/
- Do Not Touch:
  - src/state/
  - src/story/
  - docker-compose.yml
  - docker-compose.gpu.yml
- Dependencies:
  - T65a
- Validation:
  - `cargo run --manifest-path launcher/Cargo.toml -- start-dev --no-browser`
- Definition of Done:
  - the supported launcher path runs through `SunRay` instead of PowerShell
  - launcher preflight, GPU checks, port fallback, and readiness behavior remain available without shell helper files
  - `scripts/start-dev.ps1` is deleted after parity is validated
  - no new launcher logic lives in `.ps1`
- Handoff Notes:
  - keep the GPU-backed Docker LiteLLM plus Ollama contract intact
  - do not rewrite Docker configuration as part of this task
  - `SunRay` is still not a webview shell or alternate runtime host; it only orchestrates the existing app path
  - completed on 2026-03-09 by implementing `SunRay start-dev` in Rust with shared launcher config/env/process helpers plus direct Docker, NVIDIA, port-fallback, and readiness orchestration under `launcher/src/start_dev.rs`
  - the launcher now forces the supported GPU-backed LiteLLM plus Ollama path even when `.env` still contains older direct-provider experiments, and it supports both `--no-browser` and `--rebuild`
  - `scripts/start-dev.ps1` was deleted in the same slice after parity validation, and `package.json` plus README launcher guidance now point at `cargo run --manifest-path launcher/Cargo.toml -- start-dev`
  - validation on 2026-03-09 ran `cargo check --manifest-path launcher/Cargo.toml`, `cargo test --manifest-path launcher/Cargo.toml`, and `cargo run --manifest-path launcher/Cargo.toml -- start-dev --no-browser`
  - live validation confirmed Docker startup, NVIDIA runtime detection, port fallback from `3000` to `3100`, container health checks, app readiness polling, and setup-preflight reporting through the Rust launcher path

### T65c - SunRay Local AI Workflow Harness Migration

- Status: Review
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: AI systems lead
- Goal: Replace the current local AI workflow PowerShell harness with a Rust command that keeps the same contract checks and provider-facing smoke semantics.
- Scope:
  - migrate `scripts/test-local-ai-workflow.ps1` into the Rust tooling crate, including selection-only mode and live-provider checks
  - keep the compact-schema guardrail path wired into the Rust harness, whether by porting or invoking the existing validation helper behind the Rust command
  - preserve the current local GPU profile-selection assertions and provider-config resolution behavior
  - expose a stable Rust command that later AI tasks can use in validation instead of shell syntax
- Files to Touch:
  - sunray_backlog.md
  - README.md
  - package.json
  - launcher/
  - scripts/
- Do Not Touch:
  - src/state/
  - src/story/
  - docker-compose.yml
  - docker-compose.gpu.yml
- Dependencies:
  - T65a
- Validation:
  - `cargo run --manifest-path launcher/Cargo.toml -- test-local-ai-workflow --selection-only`
  - Manual compatible-provider smoke when a local provider is available
- Definition of Done:
  - local AI regression checks run through `SunRay` instead of PowerShell
  - selection-only schema-contract checks remain available for task validations
  - future AI tasks can reference one Rust harness path without adding shell wrappers
  - `scripts/test-local-ai-workflow.ps1` is deleted after parity is validated
- Handoff Notes:
  - keep the validation contract deterministic first; live provider smoke remains secondary to the focused contract checks
  - do not silently drop current assertions just because the implementation language changes
  - completed implementation on 2026-03-09 by adding `launcher/src/test_local_ai_workflow.rs` and wiring `SunRay test-local-ai-workflow` to run the deterministic local GPU profile-selection assertions, the compact-schema guardrail command, and the OpenAI-compatible embedding plus chat smoke checks from the Rust launcher runtime
  - `package.json` now points `npm run test:local-ai` at the Rust command surface instead of the PowerShell harness, and README guidance now treats the Rust command as the supported path
  - validation on 2026-03-09 ran `cargo check --manifest-path launcher/Cargo.toml`, `cargo test --manifest-path launcher/Cargo.toml`, `cargo run --manifest-path launcher/Cargo.toml -- test-local-ai-workflow --selection-only`, and a full `cargo run --manifest-path launcher/Cargo.toml -- test-local-ai-workflow` smoke against the configured local Ollama-compatible provider
  - awaiting final manual removal of `scripts/test-local-ai-workflow.ps1` before this task can move from `Review` to `Done` because file deletion is being handled manually in this workspace

### T65d - SunRay Validator Command Migration

- Status: Review
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Replace the standalone PowerShell validation commands in `scripts/` with Rust equivalents so config and matrix checks stop depending on shell parsing.
- Scope:
  - replace `scripts/validate-local-gpu-profile-matrix.ps1`
  - replace `scripts/validate-litellm-default-config.ps1`
  - centralize file-loading, JSON or YAML parsing, and failure-report formatting in the Rust tooling crate
  - keep the validation coverage aligned with the current matrix and LiteLLM config expectations
- Files to Touch:
  - sunray_backlog.md
  - README.md
  - launcher/
  - scripts/
- Do Not Touch:
  - src/server/
  - src/ui/
  - docker-compose.yml
  - docker-compose.gpu.yml
- Dependencies:
  - T65a
- Validation:
  - `cargo run --manifest-path launcher/Cargo.toml -- validate-local-gpu-profile-matrix`
  - `cargo run --manifest-path launcher/Cargo.toml -- validate-litellm-default-config`
- Definition of Done:
  - both config validators run through `SunRay`
  - validator output remains clear enough for manual repo consistency work
  - no validator behavior depends on PowerShell text handling
  - `scripts/validate-local-gpu-profile-matrix.ps1` and `scripts/validate-litellm-default-config.ps1` are deleted after parity is validated
- Handoff Notes:
  - keep validator scope narrow; this task is about parity, not a broader config redesign
  - completed implementation on 2026-03-09 by adding `launcher/src/validators.rs` and routing both validator subcommands through Rust so `SunRay validate-local-gpu-profile-matrix` now checks the JSON matrix structure, LiteLLM local-GPU alias wiring, and Docker Compose default env alignment, while `SunRay validate-litellm-default-config` checks the default Docker Ollama alias targets in `litellm.config.yaml`
  - validation on 2026-03-09 ran `cargo check --manifest-path launcher/Cargo.toml`, `cargo test --manifest-path launcher/Cargo.toml`, `cargo run --manifest-path launcher/Cargo.toml -- validate-local-gpu-profile-matrix`, and `cargo run --manifest-path launcher/Cargo.toml -- validate-litellm-default-config`
  - awaiting final manual removal of `scripts/validate-local-gpu-profile-matrix.ps1` and `scripts/validate-litellm-default-config.ps1` before this task can move from `Review` to `Done` because file deletion is being handled manually in this workspace

### T65e - SunRay Setup Smoke And Desktop Wrapper Migration

- Status: Review
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Release lead
- Goal: Replace the remaining operational PowerShell wrappers with Rust commands so browser smoke and desktop prototype entrypoints match the new tooling runtime.
- Scope:
  - replace `scripts/test-setup-browser-smoke.ps1` with a Rust command that runs the same build, type-check, focused test, and client-build sequence
  - replace `scripts/start-desktop-prototype.ps1` with a Rust command that starts the existing Electron prototype flow
  - keep the commands orchestration-focused and let Docker, npm, and Electron remain the underlying executables
  - align logging and error behavior with the rest of the Rust tooling crate
- Files to Touch:
  - sunray_backlog.md
  - README.md
  - package.json
  - launcher/
  - scripts/
- Do Not Touch:
  - packaging/electron/
  - docker-compose.yml
  - docker-compose.gpu.yml
  - src/state/
- Dependencies:
  - T65a
  - T65b
- Validation:
  - `cargo run --manifest-path launcher/Cargo.toml -- test-setup-browser-smoke`
  - `cargo run --manifest-path launcher/Cargo.toml -- start-desktop-prototype`
- Definition of Done:
  - the remaining script entrypoints no longer depend on PowerShell
  - smoke and prototype wrappers follow the same Rust logging and process conventions as the launcher
  - Electron and browser smoke flows remain callable without introducing new shell scripts
  - `scripts/test-setup-browser-smoke.ps1` and `scripts/start-desktop-prototype.ps1` are deleted after parity is validated
- Handoff Notes:
  - do not change Electron packaging direction here; this task only changes the orchestration layer around the existing prototype command
  - `SunRay` is not replacing Electron and is not becoming a desktop shell
  - completed implementation on 2026-03-09 by adding `launcher/src/test_setup_browser_smoke.rs` and `launcher/src/start_desktop_prototype.rs`, routing both `SunRay` subcommands through Rust, and extending the shared process helper so inherited environment variables such as `ELECTRON_RUN_AS_NODE` can be cleared for child launches
  - validation on 2026-03-09 ran `cargo check --manifest-path launcher/Cargo.toml`, `cargo test --manifest-path launcher/Cargo.toml`, and `cargo run --manifest-path launcher/Cargo.toml -- test-setup-browser-smoke`, which passed through the Rust path and exercised the Docker app build, browser-focused type-check, targeted setup smoke tests, and browser bundle rebuild
  - `cargo run --manifest-path launcher/Cargo.toml -- start-desktop-prototype` currently fails early in this workspace because `npm` was not available on `PATH` in the validating terminal, which matches the legacy wrapper's host prerequisite behavior; rerun that command in a host shell with Node.js 22 available to finish the live desktop wrapper check
  - awaiting final manual removal of `scripts/test-setup-browser-smoke.ps1` and `scripts/start-desktop-prototype.ps1` before this task can move from `Review` to `Done` because file deletion is being handled manually in this workspace

### T65f - Shell Reference Cleanup And Script Deletion

- Status: Blocked
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Remove shell-script references from the supported tooling path once `SunRay` has parity and update repo-visible launcher copy to the new contract.
- Scope:
  - update `package.json`, README guidance, backlog validation text used by still-open tasks, and any remaining launcher-copy references in `src/server/` or `src/ui/`
  - remove obsolete `.ps1` entrypoints and `scripts/lib/*.ps1` after the Rust replacements are validated
  - update test fixtures that currently assert PowerShell launcher strings so they point at the Rust command surface
  - leave historical closeout notes intact where they are part of completed-task audit history, but stop using them as active guidance
- Files to Touch:
  - sunray_backlog.md
  - README.md
  - package.json
  - launcher/
  - scripts/
  - src/server/
  - src/ui/
- Do Not Touch:
  - docker-compose.yml
  - docker-compose.gpu.yml
  - packaging/electron/
  - src/state/
  - src/story/
- Dependencies:
  - T65b
  - T65c
  - T65d
  - T65e
- Validation:
  - `cargo test --manifest-path launcher/Cargo.toml`
  - Manual doc, launcher-copy, and recovery-copy consistency review
- Definition of Done:
  - supported docs and UI or server launcher references no longer point at PowerShell
  - obsolete PowerShell files are removed from the active tooling path
  - package and validation entrypoints reference `SunRay` under `launcher/` instead of shell scripts
- Handoff Notes:
  - this is the cleanup gate that actually retires the legacy `.ps1` surface; do not remove those files before parity work is validated

### T65g - SunRay Copilot Prompt Scaffolding

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P2
- Owner Role: Tech lead
- Goal: Add project-specific Rust Copilot prompt assets so future `SunRay` work uses this repo's launcher boundaries, validation rules, and parity contract instead of generic Rust instructions.
- Scope:
  - add Rust-focused Copilot instruction and prompt files under `.github/` for `launcher/` work
  - adapt useful structure from the user's Rust prompt repository to this repo's `SunRay` migration context
  - keep the guidance specific to `SunRay` command parity, validation, and non-goals instead of copying generic Rust templates verbatim
- Files to Touch:
  - sunray_backlog.md
  - .github/
- Do Not Touch:
  - src/state/
  - src/story/
  - docker-compose.yml
  - docker-compose.gpu.yml
- Dependencies:
  - T65
- Validation:
  - Manual instruction and prompt-file consistency review
- Definition of Done:
  - the repo contains reusable Rust Copilot assets tailored to `launcher/SunRay`
  - the new guidance reflects current backlog, architecture, and validation rules for Rust launcher work
  - future Rust changes can start from project-specific prompts instead of generic repository placeholders
- Handoff Notes:
  - created on 2026-03-09 in response to a direct user request to bring useful patterns from `macg4dave/My-RUST-copilot-promts` into this repo
  - keep the prompt assets scoped to `SunRay` launcher work unless later Rust crates are added elsewhere in the repo
  - completed on 2026-03-09 by adding `.github/instructions/sunray-rust.instructions.md` plus the prompt templates `.github/prompts/sunray-rust-project.prompt.md`, `.github/prompts/sunray-rust-parity.prompt.md`, and `.github/prompts/sunray-rust-refactor.prompt.md`
  - the new assets adapt the user's generic Rust prompt structure to this repo's launcher-specific rules: `SunRay` command parity, Rust-only automation direction, Cargo validation commands, and strict non-goals around Docker, Electron, and the TypeScript runtime

## Immediate Open Decisions

| ID | Decision | Needed By | Owner | Status |
| --- | --- | --- | --- | --- |
| S01 | Exact `SunRay` CLI syntax beyond the current parity-focused subcommands | Before `T65a` closes | Tech lead | Resolved on 2026-03-09: one parity-focused binary surface with `start-dev`, `test-local-ai-workflow`, `test-setup-browser-smoke`, `validate-local-gpu-profile-matrix`, `validate-litellm-default-config`, and `start-desktop-prototype` |
| S02 | Whether temporary `.ps1` wrappers are allowed during early parity work or should be skipped entirely | Before `T65b` starts | Tech lead | Resolved on 2026-03-09: existing `.ps1` entrypoints remain temporary legacy compatibility surfaces only until each parity slice deletes them, and they must not gain new behavior |
| S03 | Whether `SunRay` should expose one binary with subcommands or one binary plus aliases or wrappers | Before `T65a` closes | Tech lead | Resolved on 2026-03-09: one `SunRay` binary with subcommands, not a parallel alias or wrapper surface |

## Agent Execution Rules

- Prefer the smallest migration slice that deletes one legacy script cleanly.
- Do not silently expand `SunRay` into installer, packaging, or app-runtime scope.
- Do not mark a task `Done` without running its listed validation.
- If validation cannot be run, leave the task at `Review` and record exactly what is unverified.
- Keep docs, launcher copy, and command examples aligned with the current migration state.
- Do not preserve legacy scripts as permanent compatibility layers.
- If a task reaches parity but does not delete the legacy script, it is not done.
