# Roadmap

This document is the strategic delivery plan for the project. It describes the intended product shape, the MVP boundary, the order of work, and the conditions for advancing between phases.

Kickoff-relative timing is used on purpose. "Week 1" means the first week active development begins after this roadmap is accepted.

## Current Status

- Roadmap baseline date: 2026-03-08
- Delivery status: pre-MVP
- Planning status: rebaselined around end-user-first, double-click-friendly delivery

## Primary Product Principle

- End-user friendliness outranks developer convenience when sequencing work.
- The supported player path should hide terminal usage, manual service orchestration, and guesswork wherever possible.
- The browser/server split is an implementation detail. The shipped experience should feel like one obvious app.

## Vision

Build a portable text-based adventure that feels like a normal desktop app to the player: launch from one obvious entry point, get clear recovery help when setup is wrong, then play a coherent AI-directed story with deterministic, server-side state.

## Product Outcomes

The roadmap is successful if the project reaches all of the following:

- A first-time player on the primary supported platform can launch the game from one obvious file or desktop action and reach the first turn quickly.
- The app performs startup checks for missing config, missing AI connectivity, and incompatible saves, then shows clear recovery steps.
- A player can start a game, play multiple turns, save, load, and finish a guided story arc without using a terminal.
- The game state can be replayed from the event log with deterministic results.
- AI output is validated before it affects authoritative state.
- Content authors can change quests and director rules without code edits.
- The same gameplay stack powers both the browser-based development loop and the packaged player build.

## MVP

### MVP Definition

The MVP is the first release that proves the core product loop while feeling like a normal app to the player:

- Windows-first double-click launch path or packaged shell that starts the app and opens the play surface automatically.
- First-run setup path that validates required config and offers a clear supported Docker-managed LiteLLM gateway path, with Docker Desktop treated as the MVP packaged prerequisite and an optional GPU-backed local inference override, instead of silent failure.
- Start a new game with basic onboarding and tutorial guidance.
- Submit turns through the UI.
- Generate structured responses through a repo-managed LiteLLM Docker sidecar by default, whether the upstream model is local AI or a hosted provider.
- Persist turns, state, and replayable events in SQLite.
- Enforce server-side validation and deterministic state updates.
- Retrieve compact memory summaries during play.
- Apply director rules to keep pacing and quest progression on track.
- Save and load from the main player flow.
- Ship at least one playable quest or story arc end to end.

Browser-first development remains supported, but the MVP is judged on the player-facing launch path, not only on developer ergonomics.

### MVP Exit Criteria

The MVP is complete only when all of the following are true:

- On a clean Windows machine following the supported setup guide, a tester can reach the first playable turn from one obvious launcher without terminal interaction after prerequisite install.
- Startup preflight catches missing env values, unreachable AI endpoints, and obvious misconfiguration before gameplay begins, with recovery steps written for non-developers.
- The supported setup guide brings up the app plus the repo-managed LiteLLM container from one documented path, and the optional GPU override path is documented and smoke-tested.
- The MVP packaged playtest path clearly states that the app shell is bundled but the AI gateway still depends on Docker Desktop and the repo-managed LiteLLM sidecar.
- A new player can complete a scripted story arc without manual intervention, opening devtools, or editing config files mid-session.
- A golden replay fixture reproduces the same final state from the stored event log.
- Save and load work across at least one schema version change using documented migration rules.
- The default LiteLLM chat route and embedding route are both exercised in automated integration tests.
- Numeric budgets for latency, tokens per turn, and cost per 100 turns are recorded in [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md) and met in the MVP test fixture suite.
- The packaged or launched player path and the browser dev path both use the same server-side gameplay stack.
- The MVP scope in [BACKLOG.md](/g:/text-game/BACKLOG.md) has no open P1 items.

### Explicitly Out of Scope for MVP

- Signed multi-platform installers before the Windows playtest bundle is stable
- Auto-update flows
- Rich quest-authoring UX beyond the minimum needed to prove authorable content
- Optional Linux packaging
- Advanced theming beyond readability and accessibility requirements
- Fully offline model runtime as the main supported experience

## Phase Plan

Each phase below has a user-visible outcome, a clear owner role, and measurable gates. Detailed implementation tasks live in [BACKLOG.md](/g:/text-game/BACKLOG.md).

### Phase 0 - Zero-Friction Foundations (Weeks 1-2)

Owner: Tech lead

Outcome:
- The project has one repeatable dev startup path and one credible player-facing launch path, both built on the same runtime.

Entry gate:
- Roadmap, requirements, and architecture docs accepted as the current baseline.

Exit gate:
- One documented command starts the server and web client in local development.
- One documented command resets the local database and seed content.
- One Windows launcher or equivalent double-click entry point starts the app, waits for readiness, and opens the play surface.
- Environment variables are validated at startup.
- Missing config and missing AI connectivity produce actionable recovery output in the launcher or UI.
- Startup preflight uses one blocker, warning, and info contract across launcher, browser, and packaged-path diagnostics.
- Host prerequisite checks cover Docker, ports, writable data paths, and baseline disk headroom before gameplay starts.
- Logging, migrations, and error handling are wired into the baseline app.
- The supported AI startup path brings up the app and repo-managed LiteLLM sidecar together, and the optional GPU override for local inference is documented.
- The optional local GPU path has a documented VRAM-tier model matrix with at least one verified low-VRAM tier and one verified high-VRAM tier.
- AI readiness checks distinguish LiteLLM health, alias availability, network reachability, auth failures, and local-model availability before the first turn.
- LiteLLM default alias names for chat and embeddings are documented and exercised manually.
- A packaging spike or wrapper decision is documented well enough to unblock early playtest builds.
- Numeric delivery budgets are added to [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md).

### Phase 1 - Double-Click Playable Slice (Weeks 3-5)

Owner: Product/UI lead

Outcome:
- A first-time player can start, play, save, and resume through a guided path without terminal use.

Entry gate:
- Phase 0 exit gate met.

Exit gate:
- The launcher or packaged shell reaches the first playable turn on the supported Windows target.
- Turn input, turn output, and authoritative state schemas are versioned.
- A new game can be created and played for at least 10 scripted turns in a row.
- Every turn writes an event that can be replayed deterministically.
- Invalid or unsafe model output is rejected before state mutation.
- Basic onboarding, tutorial guidance, and first-run troubleshooting are present in the player flow.
- Save and load are available from the main UI.
- The default turn path uses LiteLLM without direct provider SDK usage outside the adapter boundary.
- The setup flow offers safe end-user profiles plus validated advanced overrides for developer-oriented configuration changes.
- When a user opts into local GPU inference, the launcher or setup flow can recommend or auto-select a compatible model profile based on detected hardware or a manual override.
- Common setup blockers can be retried or repaired from the player flow without reopening a terminal or deleting saves.
- A golden replay test passes in CI for the baseline quest fixture.

### Phase 2 - Memory, Director, and Session Continuity (Weeks 6-8)

Owner: AI systems lead

Outcome:
- The launched game remembers prior context compactly and stays coherent across longer sessions.

Entry gate:
- Phase 1 exit gate met.

Exit gate:
- Retrieval returns ranked memory summaries for each turn.
- Director rules are loaded from versioned specs and can be reloaded without app reinstall.
- Director enforcement runs server-side before authoritative state is committed.
- The embedding route, chat route, and fallback behavior are covered by integration tests.
- Token use for the baseline replay fixture stays within the documented budget.
- Save compatibility rules are documented and at least one migration path is tested.

### Phase 3 - Packaged Playtest Build and Accessibility (Weeks 9-11)

Owner: Release lead

Outcome:
- The internal web stack is wrapped and distributed as a normal Windows app or bundle for non-technical playtesters.

Entry gate:
- Phase 2 exit gate met.

Exit gate:
- The packaging decision is locked with rationale and no open blocker to building Windows playtest bundles.
- A portable build or installer can be launched by double-click on a clean Windows test machine.
- First-run checks behave correctly inside the packaged environment.
- Save locations, logs, and repair or reset steps are documented in plain language.
- Keyboard navigation, contrast checks, and readable defaults pass the documented accessibility checklist.
- Crash and error surfaces are understandable enough for external testers to report failures.

### Phase 4 - Authorable Content and Operational Hardening (Weeks 12-15)

Owner: Gameplay systems lead

Outcome:
- Designers can change content safely and the system is observable and resilient enough for broader playtesting.

Entry gate:
- Phase 3 exit gate met.

Exit gate:
- Quest specs validate against a versioned schema.
- Quest progression is visible in an admin surface or equivalent inspection tool.
- World state changes are diffable and replayable.
- A non-engineer can modify the sample quest content using documented tooling.
- Unit, integration, replay, and fuzz tests run in CI on every push.
- Telemetry captures latency, token usage, validation failures, retries, and model costs.
- Safety policy, redaction rules, and failure fallback behavior are documented and implemented.
- Backup, restore, and incident debugging steps are verified from the runbook.

### Phase 5 - Broad Release Readiness (Weeks 16-18)

Owner: Release lead

Outcome:
- The first playtest bundle becomes a supportable release process instead of a one-off build.

Entry gate:
- Phase 4 exit gate met.

Exit gate:
- Signed Windows builds are produced and tested.
- macOS build feasibility is either proven or explicitly deferred with rationale.
- Installer, update, rollback, and release checklist steps are documented and rehearsed.
- Crash reporting is enabled for packaged builds.
- No blocker remains between the validated Windows bundle and a limited public release.

## Sequencing Rules

- No phase may close with unresolved P1 items assigned to that phase in [BACKLOG.md](/g:/text-game/BACKLOG.md).
- A player path that still requires terminal usage, manual env editing, or hidden service restarts cannot count as end-user ready.
- Save and load cannot be treated as stable until schema compatibility rules are documented and tested.
- Packaging work must not force provider-specific gameplay logic into the app runtime.
- Authoring tools cannot outrank core player launch friction while clean-machine playtesting is still failing.

## Now / Next / Later

### Now

- Lock the supported Windows-first double-click target and capture the packaging or wrapper decision early.
- Close the remaining validation and packaging implications of the Docker-managed LiteLLM sidecar plus optional GPU override.
- Define the first GPU-tier model matrix for the optional local inference path so setup can stop depending on manual model guesswork.
- Lock the shared blocker, warning, and info preflight policy and extend it to host, AI, storage, and save checks.
- Finish launcher preflight, config validation, and clear recovery messaging.
- Make onboarding, first-run troubleshooting, and save or load part of the core loop scope instead of late polish.
- Add a clean-machine playtest checklist for the supported launch path.

### Next

- Ship the deterministic turn pipeline through the supported launched app.
- Add automatic local-model profile selection and setup guidance for common VRAM tiers.
- Add guided retry, auto-fix, and advanced-details setup flows on top of the shared preflight contract.
- Add memory retrieval and director control without increasing player-facing setup friction.
- Produce the first packaged Windows playtest build.

### Later

- Expand quest tooling and admin inspection.
- Harden operations and safety posture for broader playtesting.
- Add signed multi-platform release work and update infrastructure after the Windows player path is stable.

## Risks

| Risk | Owner | Mitigation | Review Trigger |
| --- | --- | --- | --- |
| The supported launch path still depends on AI setup that feels like developer work. | Tech lead | Pick one primary MVP AI path, add first-run connection tests, and write recovery steps in player language. | First clean-machine tester fails before reaching the first turn |
| The Docker-managed LiteLLM default may conflict with packaging assumptions or fail on machines without working Docker or NVIDIA passthrough support. | Release lead | Keep the MVP packaged contract explicit: Docker Desktop is required for AI startup, hosted-first remains the default, and GPU prerequisite failures must fall back to plain-language guidance instead of silent startup hangs. | First clean-machine launcher or packaged test fails before LiteLLM becomes ready |
| The optional local GPU path may choose models that exceed VRAM or perform badly on common cards. | AI systems lead | Define a VRAM-tier profile matrix, add conservative defaults, and let users override the detected profile when needed. | First out-of-memory or unusably slow local-GPU smoke test on a supported tier |
| Preflight may become either too strict for developers or too vague for end users. | Tech lead | Separate blocker versus warning policy from advanced diagnostics, keep the default surface plain-language, and validate manual overrides through the same contract. | First common setup issue requires support to explain hidden diagnostics or bypass checks manually |
| Packaged runtime and local server coordination cause fragile startup or antivirus friction. | Release lead | Decide the wrapper early, prototype startup behavior, log launch phases, and smoke-test on clean Windows machines. | First packaged build requires manual recovery beyond the documented flow |
| Save locations and schema migration rules confuse players in packaged builds. | Tech lead | Lock save-path conventions early, expose save slots in the UI, and require migration coverage before broader playtests. | First unreadable save or misplaced save report |
| Structured output through LiteLLM is less reliable than expected for the chosen upstream models. | AI systems lead | Maintain strict validation, fixture-based replay tests, and a fallback response path before state mutation. | First failed replay caused by model variance |
| Memory summaries exceed token budgets and make turns too expensive. | AI systems lead | Track summary size, cap retrieval inputs, and test against the baseline fixture budget before Phase 2 closes. | Budget breach in the baseline fixture suite |

## Decision Log

| Decision | Status | Owner | Rationale | Next Review |
| --- | --- | --- | --- | --- |
| Node.js + TypeScript app with lightweight browser asset compilation and SQLite | Locked | Tech lead | Keeps local development on direct TypeScript, keeps player-facing runtime paths on compiled server output, and adds compile-time safety without changing the runtime boundary. | After MVP |
| Internal runtime stays web and HTTP based, but player-facing delivery is Windows-first and double-click oriented | Locked | Tech lead | Preserves one gameplay stack while hiding implementation details from players. | End of Phase 3 |
| Electron is the Phase 0 packaging spike direction for Windows playtest builds | Locked | Release lead | Fits the current Node plus browser stack, reduces shell complexity versus Tauri, and provides a clearer bridge from launcher to portable build. | Start of T36 |
| LiteLLM-managed gateway runs as a repo-managed Docker sidecar by default, with an optional GPU-backed local inference override for larger local models | Locked | AI systems lead | Keeps the player-facing setup centered on one provider-neutral gateway, removes manual proxy startup from the default path, and still allows hosted and local upstreams behind the same boundary. | End of Phase 2 |
| MVP packaged AI startup still depends on Docker Desktop and the repo-managed LiteLLM sidecar rather than bundling the gateway into Electron | Locked | Release lead | Avoids splitting AI-runtime ownership across two packaging strategies during Phase 0 and lets the launcher, setup flow, and packaged shell share one gateway contract and recovery language. | Start of T36 |
| Provider-neutral internal adapter boundary | Locked | Tech lead | Prevents provider-specific logic from leaking across the app. | End of Phase 1 |
| Server-side director enforcement is authoritative | Locked | Gameplay systems lead | Keeps story control and state integrity outside the client. | After first external playtest |
| Windows is the primary supported end-user platform for MVP | Locked | Release lead | Reduces packaging surface area so launch quality can be solved properly before expanding platform support. | After first external playtest |

## References

- Product scope: [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md)
- Detailed execution backlog: [BACKLOG.md](/g:/text-game/BACKLOG.md)
- Cross-cutting delivery policy: [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md)
- Technical structure: [ARCHITECTURE.md](/g:/text-game/ARCHITECTURE.md)
