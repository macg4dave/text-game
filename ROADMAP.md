# Roadmap

This document is the strategic delivery plan for the project. It describes the intended product shape, the MVP boundary, the order of work, and the conditions for advancing between phases.

Kickoff-relative timing is used on purpose. "Week 1" means the first week active development begins after this roadmap is accepted.

## Current Status

- Roadmap baseline date: 2026-03-08
- Delivery status: pre-MVP
- Phase status: Phase 0 closed, and Phase 1 remains the active delivery phase
- Planning status: rebaselined around end-user-first, double-click-friendly delivery, with the `SunRay` migration blocker lifted and the remaining Rust-native launcher cleanup tracked separately under `T66`

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
- Deterministic replay means reconstructing final state from committed semantic events, not by re-querying models from historical prompts or prose.
- AI output is validated before it affects authoritative state.
- Content authors can change quests and director rules without code edits.
- The same gameplay stack powers both the browser-based development loop and the launcher-driven player path.

## MVP

### MVP Definition

The MVP is the first release that proves the core product loop while feeling like a normal app to the player:

- Windows-first double-click Rust launcher that starts the app and opens the play surface automatically.
- First-run setup path that validates required config and offers a clear supported Docker-managed LiteLLM gateway path, with Docker Desktop treated as the MVP packaged prerequisite and the GPU-backed Ollama path treated as the normal launcher contract instead of a hidden opt-in.
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

### Baseline Content Slice

- The baseline MVP story arc should be treated as `story_sample`.
- Story-specific labels, locations, NPC names, and branch names should stay placeholder-shaped until content implementation begins, using names such as `story_sample_name`, `story_sample_location`, and `story_sample_npc`.
- The baseline sample remains intentionally small enough for the first end-to-end playable slice while still exercising onboarding, dialogue, movement, item use, consequence adjudication, save or load, and deterministic replay.

### MVP Exit Criteria

The MVP is complete only when all of the following are true:

- On a clean Windows machine following the supported setup guide, a tester can reach the first playable turn from one obvious launcher without terminal interaction after prerequisite install.
- Startup preflight catches missing env values, unreachable AI endpoints, and obvious misconfiguration before gameplay begins, with recovery steps written for non-developers.
- The supported setup guide brings up the app plus the repo-managed LiteLLM container from one documented GPU-backed path, and that path is smoke-tested.
- The MVP launcher playtest path clearly states that the launcher binary is thin orchestration and the AI gateway still depends on Docker Desktop and the repo-managed LiteLLM sidecar.
- A new player can complete a scripted story arc without manual intervention, opening devtools, or editing config files mid-session.
- A golden replay fixture reproduces the same final state from the stored event log.
- Save and load work across at least one schema version change using documented migration rules.
- The default LiteLLM chat route and embedding route are both exercised in automated integration tests.
- Numeric budgets for latency, tokens per turn, and cost per 100 turns are recorded in [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md), loaded from the runtime budget config, and met in the MVP test fixture suite.
- The launcher-driven player path and the browser dev path both use the same server-side gameplay stack.
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
- Startup preflight uses one blocker, warning, and info contract across launcher and browser diagnostics.
- Host prerequisite checks cover Docker, ports, writable data paths, and baseline disk headroom before gameplay starts.
- Logging, migrations, and error handling are wired into the baseline app.
- The supported AI startup path brings up the app and repo-managed LiteLLM sidecar together on the GPU-backed Ollama path.
- The GPU-backed launcher path has a documented VRAM-tier model matrix with at least one verified low-VRAM tier and one documented high-VRAM tier, with heuristic labeling until matching hardware validation is complete.
- AI readiness checks distinguish LiteLLM health, alias availability, network reachability, auth failures, and local-model availability before the first turn.
- LiteLLM default alias names for chat and embeddings are documented and exercised manually.
- A launcher delivery decision is documented well enough to unblock early playtest builds.
- Numeric delivery budgets are added to [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md).

### Phase 1 - Double-Click Playable Slice (Weeks 3-5)

Owner: Product/UI lead

Outcome:

- A first-time player can start, play, save, and resume through a guided path without terminal use.

Entry gate:

- Phase 0 exit gate met.

Exit gate:

- The launcher reaches the first playable turn on the supported Windows target.
- Turn input, turn output, and authoritative state schemas are versioned.
- The model-facing turn schema stays compact and transport-oriented instead of becoming the game's hidden design language.
- A new game can be created and played for at least 10 scripted turns in a row.
- Every turn writes an event that can be replayed deterministically.
- Every turn writes a committed semantic event record that is sufficient to reconstruct authoritative state without depending on exact narrator prose.
- A deterministic schema guardrail check rejects scene-ontology or mixed-authority field creep before prompt or validator changes expand the model contract.
- Invalid or unsafe model output is rejected before state mutation.
- Model-authored consequences remain proposals until the server accepts them, and rejected proposals cannot appear as committed story truth in the player-facing turn result.
- Basic onboarding, tutorial guidance, and first-run troubleshooting are present in the player flow.
- Save and load are available from the main UI.
- The default turn path uses LiteLLM without direct provider SDK usage outside the adapter boundary.
- The setup flow offers safe end-user profiles plus validated advanced overrides for developer-oriented configuration changes.
- When a user opts into local GPU inference, the launcher or setup flow can recommend or auto-select a compatible model profile based on detected hardware or a manual override.
- Common setup blockers can be retried or repaired from the player flow without reopening a terminal or deleting saves.
- A golden replay test passes in CI for the baseline `story_sample` fixture.

### Phase 2 - Memory, Director, and Session Continuity (Weeks 6-8)

Owner: AI systems lead

Outcome:

- The launched game remembers prior context compactly, stays coherent across longer sessions, and can answer grounded guide questions about what the player already knows.

Entry gate:

- Phase 1 exit gate met.

Exit gate:

- Retrieval returns ranked memory summaries for each turn.
- Memory classes and retrieval policy distinguish authority-relevant facts from flavor-only recollections before longer-session continuity is treated as stable.
- NPC continuity uses significance-scored structured encounter facts and tiered long-lived memory instead of replaying raw dialogue history.
- Live model context is assembled from budgeted memory buckets rather than from one expanding prompt, and raw history remains cold unless explicitly retrieved.
- Scene- and chapter-level summary artifacts are versioned so recap logic can be recomputed from canonical records when needed.
- Context-entry accounting and retrieval traces make it possible to inspect what entered the turn context and why.
- Players can ask an optional guide surface grounded questions about known places, NPCs, goals, and prior discoveries without spending a story turn or mutating state.
- Director rules are loaded from versioned specs and can be reloaded without app reinstall.
- Director enforcement runs server-side before authoritative state is committed.
- Director enforcement frames accepted outcomes after simulation resolution instead of acting as the primary plausibility gate for player actions.
- The embedding route, chat route, and fallback behavior are covered by integration tests.
- Delivery budgets are loaded from one server-side config source and exposed through an advanced runtime surface without file edits.
- Token use for the baseline replay fixture stays within the documented budget.
- Save compatibility rules are documented and at least one migration path is tested.

### Phase 3 - Launcher Playtest Build and Accessibility (Weeks 9-11)

Owner: Release lead

Outcome:

- Platform-native Rust launcher binaries deliver the Docker-backed runtime to non-technical playtesters without an extra desktop-shell layer.

Entry gate:

- Phase 2 exit gate met.

Exit gate:

- The launcher delivery decision is locked with rationale and no open blocker to building Windows playtest launcher bundles.
- A launcher bundle can be launched by double-click on a clean Windows test machine.
- First-run checks behave correctly through the launcher path.
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
- A non-engineer can modify the sample story-arc content using documented tooling.
- Unit, integration, replay, and fuzz tests run in CI on every push.
- Telemetry captures latency, token usage, validation failures, retries, and model costs.
- The baseline fixture suite enforces configured latency, token, cost, and DB-growth budgets with clear breach reporting.
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
- Turn, replay, and save work must not treat raw model prose as authoritative world truth; the authority boundary must be locked before those later contracts solidify.
- Replay, save, and fixture work must not rely on rerunning model generation from raw prompts or responses; semantic event design must be locked before the event log becomes a long-term contract.

## Planning Intake Rules

- [BACKLOG.md](/g:/text-game/BACKLOG.md) is the execution source of truth. If roadmap sequencing or active work detail drifts from the backlog, update this file to match the backlog rather than treating the roadmap as the tie-breaker.
- When a future issue changes phase sequencing, exit gates, near-term priorities, risks, or open decisions, update this roadmap in the same session as the matching [BACKLOG.md](/g:/text-game/BACKLOG.md) parent issue and child tasks.
- Capture implementation detail in the backlog, not here. This roadmap should record phase placement, rationale, risks, and milestone effects only.
- Future-looking issues that are not yet startable should still be reflected through roadmap sequencing or risk notes when they materially affect delivery order.

## Now / Next / Later

### Now

- Resume broader Phase 1 backlog work now that `T65` no longer blocks unrelated implementation.
- Keep the `T66` follow-up scoped to Rust-native launcher cleanup: remove shell-era wording, asset assumptions, and monolithic orchestration without reopening the migration blocker.
- Keep the launcher refactor scoped to automation only: replace shell orchestration, not Docker, the installer path, or the Node gameplay runtime.
- Ship the versioned turn pipeline through the supported launched app.
- Lock the proposal-only authority boundary before more turn, replay, and save work deepens the Phase 1 contract.
- Lock a compact model schema boundary before turn validation and pipeline work harden a smart-scene contract into the engine surface.
- Define the event log around committed semantic outcomes before `T09` and later save or replay fixtures harden transcript-only storage.
- Make the first-run player path understandable without README reading by landing onboarding, setup, retry, and recovery flow work.
- Add save and load to the main player flow so session continuity is part of the supported slice, not a later add-on.
- Keep the supported Windows launcher and browser path aligned while Phase 1 replaces developer-facing gaps with player-facing guidance.
- Author the locked `story_sample` baseline arc so the tutorial, replay, and save or load path are proven against one concrete story slice.

### Next

- Add memory retrieval and director control without increasing player-facing setup friction.
- Add an optional DM-style guide for grounded recall and orientation once memory retrieval, partitioning, and summaries are stable.
- Separate freeform intent interpretation, simulation resolution, and pacing before later director-spec and quest-progression work hardens the wrong gameplay boundary.
- Keep the turn-output schema compact so later validator, memory, and director work extends server-owned logic instead of growing model contract complexity.
- Add a deterministic schema-contract guardrail so later prompt or validator work fails loudly when it tries to smuggle gameplay design back into model fields.
- Define memory classes and class-aware retrieval before Phase 2 memory work hardens one undifferentiated memory bucket.
- Define NPC significance scoring, tier promotion, and partitioned recall before retrieval or summarization work hardens raw dialogue history into the memory design.
- Define the memory storage hierarchy, per-bucket context budgets, and summary versioning before budget or telemetry work measures the wrong prompt shape.
- Land context-entry accounting and retrieval traces before later telemetry and budget enforcement work depends on opaque prompt assembly.
- Move delivery budgets from doc-only values into a shared server-side config contract and expose them through an advanced UI surface.
- Add automatic local-model profile selection and setup guidance for common VRAM tiers.
- Produce the first Windows launcher playtest bundle.

### Later

- Expand quest tooling and admin inspection.
- Turn documented delivery budgets into an enforced fixture gate with breach reporting.
- Harden operations and safety posture for broader playtesting.
- Add signed multi-platform release work and update infrastructure after the Windows player path is stable.

## Risks

| Risk | Owner | Mitigation | Review Trigger |
| --- | --- | --- | --- |
| Shell-script automation has become a delivery bottleneck and is now the wrong long-term runtime for launcher, harness, and smoke tooling. | Tech lead | Keep `SunRay` as the only supported automation surface and use `T66` to remove remaining shell-era wording, asset paths, and monolithic orchestration before they harden into the Rust runtime. | Any new task proposes adding or extending PowerShell or shell automation instead of the `SunRay` tooling surface |
| The supported launch path still depends on AI setup that feels like developer work. | Tech lead | Pick one primary MVP AI path, add first-run connection tests, and write recovery steps in player language. | First clean-machine tester fails before reaching the first turn |
| The Docker-managed LiteLLM default may conflict with launcher assumptions or fail on machines without working Docker or NVIDIA passthrough support. | Release lead | Keep the MVP launcher contract explicit: Docker Desktop plus NVIDIA support are required for AI startup, and GPU prerequisite failures must fall back to plain-language guidance instead of silent startup hangs. | First clean-machine launcher test fails before LiteLLM becomes ready |
| The GPU-backed launcher path may choose models that exceed VRAM or perform badly on common cards. | AI systems lead | Define a VRAM-tier profile matrix, add conservative defaults, and let users override the detected profile when needed. | First out-of-memory or unusably slow local-GPU smoke test on a supported tier |
| Preflight may become either too strict for developers or too vague for end users. | Tech lead | Separate blocker versus warning policy from advanced diagnostics, keep the default surface plain-language, and validate manual overrides through the same contract. | First common setup issue requires support to explain hidden diagnostics or bypass checks manually |
| Authority drift turns the model into a hidden game engine that invents world truth through prose or overreaching updates. | Gameplay systems lead | Lock a proposal-only model contract, adjudicate consequences server-side, and require drift fixtures where rejected proposals cannot leak into player-facing narrative or replay. | First turn where narrative, quest progress, or saved facts disagree with committed state |
| The model schema grows into a hidden design language that encodes scene logic or pacing policy instead of staying a compact transport boundary. | AI systems lead | Keep the schema compact, require transport justification for new fields, and move richer game semantics into validators, adjudication, reducers, or content specs. | First schema change that adds scene-ontology fields or uses schema shape to represent gameplay rules |
| Beat logic becomes a hidden railway that decides plausibility instead of pacing, making freeform play feel arbitrary. | Gameplay systems lead | Separate intent interpretation, simulation resolution, and pacing so beats frame accepted outcomes instead of blocking plausible actions. | First playtest where an off-path but sensible action is rejected or flattened because it does not match the current beat |
| Event logging hardens around transcript text instead of committed semantics, making replay unstable across model or prompt changes. | Tech lead | Define canonical semantic event fields now, store committed transitions with version markers, and keep raw prose as supplementary debug data only. | First replay attempt depends on rerunning a model or differs after prompt or model changes |
| Memory stays one undifferentiated fact bucket, causing flavor recollections to compete with canon or quest truth in retrieval. | AI systems lead | Add explicit memory classes, class-aware retrieval policy, and authority rules so narration support does not become a parallel truth system. | First turn where flavor memory changes or crowds out canon-sensitive behavior |
| NPC continuity hardens around raw dialogue retention, causing storage bloat, weak canon, and poor recognition quality for returning characters. | AI systems lead | Use structured encounter facts, significance thresholds, importance tiers, and separate NPC versus world versus journal recall before scaling retrieval or summarization. | First memory design or fixture that relies on replaying old dialogue to make an NPC feel remembered |
| Memory turns into one expanding prompt with no per-bucket accounting, causing context drift, weak explainability, and avoidable token growth. | AI systems lead | Define hot-versus-cold storage, per-bucket retrieval budgets, summary compression, and inspectable context tooling before budget and telemetry work harden the wrong prompt shape. | First turn where the team cannot explain what entered context or why a prompt grew sharply |
| Launcher runtime and local server coordination cause fragile startup or antivirus friction. | Release lead | Keep the launcher thin, log launch phases, and smoke-test platform binaries on clean machines. | First launcher bundle requires manual recovery beyond the documented flow |
| Save locations and schema migration rules confuse players in launcher-driven builds. | Tech lead | Lock save-path conventions early, expose save slots in the UI, and require migration coverage before broader playtests. | First unreadable save or misplaced save report |
| Structured output through LiteLLM is less reliable than expected for the chosen upstream models. | AI systems lead | Maintain strict validation, fixture-based replay tests, and a fallback response path before state mutation. | First failed replay caused by model variance |
| Memory summaries exceed token budgets and make turns too expensive. | AI systems lead | Track summary size, cap retrieval inputs, and test against the baseline fixture budget before Phase 2 closes. | Budget breach in the baseline fixture suite |

## Decision Log

| Decision | Status | Owner | Rationale | Next Review |
| --- | --- | --- | --- | --- |
| Node.js + TypeScript app with lightweight browser asset compilation and SQLite | Locked | Tech lead | Keeps local development on direct TypeScript, keeps player-facing runtime paths on compiled server output, and adds compile-time safety without changing the runtime boundary. | After MVP |
| Repo automation lives in the `launcher/` Rust executable `SunRay`, and PowerShell or other shell-script orchestration is retired as a supported path | Locked | Tech lead | The script surface outgrew demo-grade shell wrappers; `SunRay` gives one structured implementation language for launcher, harness, smoke, and validation commands without rewriting Docker, installers, or the app runtime. | Start of `T66` |
| Internal runtime stays web and HTTP based, but player-facing delivery is Windows-first and double-click oriented | Locked | Tech lead | Preserves one gameplay stack while hiding implementation details from players. | End of Phase 3 |
| Platform-native `SunRay` launcher binaries are the supported player-facing delivery surface across platforms | Locked | Release lead | Keeps one launcher implementation language across platforms, avoids embedded-shell build requirements in the supported path, and leaves the gameplay runtime in Docker-backed services plus the browser UI. | Start of T36 |
| LiteLLM-managed gateway runs as a repo-managed Docker sidecar by default, with the GPU-backed Ollama path as the normal launcher contract and manual larger-model overrides still available behind the same boundary | Locked | AI systems lead | Keeps the player-facing setup centered on one provider-neutral gateway, removes manual proxy startup from the default path, and still allows hosted and local upstreams behind the same boundary. | End of Phase 2 |
| MVP launcher AI startup still depends on Docker Desktop and the repo-managed LiteLLM sidecar rather than bundling the gateway into the launcher binary | Locked | Release lead | Keeps the launcher thin, preserves one AI-runtime ownership model, and lets the launcher, setup flow, and browser UI share one gateway contract and recovery language. | Start of T36 |
| Provider-neutral internal adapter boundary | Locked | Tech lead | Prevents provider-specific logic from leaking across the app. | End of Phase 1 |
| Model is a narrator plus proposal engine only; the server adjudicates which consequences become truth and player-facing narrative must align to committed state | Locked | Gameplay systems lead | Prevents authority drift, keeps replay and save contracts deterministic, and stops prose from becoming an unreviewed state-mutation path. | End of Phase 1 |
| Model-facing turn schema stays compact and transport-oriented rather than becoming the game's design language | Locked | AI systems lead | Keeps validation and schema evolution manageable while preserving server ownership of simulation, pacing, and quest semantics. | Start of T10 |
| Turn handling separates freeform intent interpretation, world simulation resolution, and story pacing or framing | Locked | Gameplay systems lead | Preserves player agency while keeping authored beats useful as pacing tools instead of hidden refusal logic. | Start of T16 |
| Director spec format stays JSON at `data/spec/director.json` for MVP | Locked | Gameplay systems lead | Matches the current runtime, tooling, and requirements contract while keeping `T16` focused on versioning and validation instead of relitigating file format. | Start of T16 |
| Event log canon is committed semantic outcome data, while prompts and prose are supplemental diagnostics or presentation artifacts | Locked | Tech lead | Keeps replay stable across model or prompt changes and makes state transitions, not transcript text, the durable record. | Start of T09 |
| Memory is classed and narration-supporting, with authority-sensitive retrieval rules and no independent truth power | Locked | AI systems lead | Prevents flavor recall from becoming a hidden authority channel and keeps canon, quest, and relationship memory usable without flattening all recall into one bucket. | Start of T13 |
| NPC memory is significance-scored, tiered, and fact-based, while transcript retention remains replay or debug data only | Locked | AI systems lead | Keeps long-session continuity sparse, deterministic, and believable without turning chat history into the canonical memory store. | Start of T14 |
| Memory is a storage hierarchy with budgeted hot context, versioned summaries, and cold history outside the default prompt | Locked | AI systems lead | Keeps token usage, retrieval quality, and context explainability under control while preserving recomputation from canonical records. | Start of T43 |
| Server-side director enforcement is authoritative | Locked | Gameplay systems lead | Keeps story control and state integrity outside the client. | After first external playtest |
| MVP sample story arc uses the placeholder `story_sample` until content implementation begins | Locked | Product/UI lead | Gives Phase 1 one concrete, tutorial-friendly end-to-end content target without hard-coding story lore that will drift before authored content work starts. | End of Phase 1 |
| Windows is the primary supported end-user platform for MVP | Locked | Release lead | Reduces packaging surface area so launch quality can be solved properly before expanding platform support. | After first external playtest |

## References

- Product scope: [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md)
- Detailed execution backlog: [BACKLOG.md](/g:/text-game/BACKLOG.md)
- Cross-cutting delivery policy: [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md)
- Technical structure: [ARCHITECTURE.md](/g:/text-game/ARCHITECTURE.md)
