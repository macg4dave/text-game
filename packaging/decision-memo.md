# Launcher Distribution Decision Memo

## Goal

Keep player-facing delivery aligned with the Rust launcher investment: every supported platform gets a native `SunRay` launcher binary, while the app, LiteLLM, and local-model services stay Docker-managed.

## Decision

Choose **launcher-first delivery** as the supported path.

What that means:

- every supported platform should ship a native `SunRay` launcher binary built on that platform
- the launcher remains orchestration only
- Docker continues to own the app runtime, LiteLLM sidecar, and local-model services
- the browser remains the player UI surface
- no embedded desktop-shell runtime is part of the supported path

## Why this is the supported direction

- it keeps one launcher implementation language across platforms
- it avoids maintaining a second delivery runtime on top of the existing browser-plus-server stack
- it keeps AI startup ownership consistent: the launcher starts or checks Docker-backed services, but it does not bundle them
- it matches the repo rule that launcher automation belongs in Rust under `launcher/`

## Player-facing contract

The launcher path should give players one obvious entry point while keeping the runtime contract explicit:

- double-click the platform-native `SunRay` binary
- the launcher checks Docker availability, AI readiness, storage health, and browser launch readiness
- the launcher opens the existing browser UI when the stack is ready
- if Docker, LiteLLM, or GPU prerequisites are missing, the same preflight contract used by the browser UI explains the fix in plain language

## AI runtime contract

For MVP and early playtests:

- Docker Desktop is a required Windows prerequisite for AI startup
- the repo-managed LiteLLM sidecar remains the default app-facing AI gateway
- the GPU-backed Docker Ollama path remains the default local-runtime contract
- the launcher binary does not bundle LiteLLM, Ollama, or model assets

## Runtime implications

### Saves

- save data remains outside the launcher binary
- launcher work should document the user-facing save location in plain language
- later installer work must preserve saves outside any install directory

### Logs

- launcher logs should capture startup and shutdown phases clearly enough for support and smoke testing
- later release work can split player-safe logs from deeper support logs if needed

### Config

- the launcher may read `.env` or validated runtime config inputs, but the supported recovery flow should not depend on users hand-editing hidden packaged files
- browser setup and launcher diagnostics should keep sharing one preflight vocabulary: `checking`, `ready`, and `action-required`

## Clean-machine checklist for T36

1. Confirm a native `SunRay` launcher binary can be launched by double-click on Windows.
2. Confirm the launcher starts the Docker-backed runtime and opens the browser UI without terminal use.
3. Confirm Docker-missing and Docker-not-running cases produce plain-language recovery steps.
4. Confirm LiteLLM-not-ready and GPU-prerequisite failures are distinguishable from launcher startup failures.
5. Confirm save data survives launcher restarts and is not stored beside the launcher binary.
6. Confirm the fallback local port behavior still works when the default port is busy.
7. Confirm the launcher path still uses the same server-authoritative gameplay stack as the browser dev flow.

## Open follow-up work

- build and smoke-test launcher release artifacts on Windows under `T36`
- document save locations, logs, and recovery steps for playtesters
- decide later whether installer work wraps launcher binaries directly or stays out of scope for MVP
