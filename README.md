# Text Game

A portable, text-based adventure with a director layer that nudges the story toward a defined end goal while letting the player attempt anything.

The project uses the OpenAI Node SDK through a provider-neutral config layer, with LiteLLM as the default AI control plane so the same app code can target hosted providers and optional local model paths through one gateway-first contract.

The application source is TypeScript-first and module-oriented: server, state, AI, rules, and browser authoring code now live under `src/**`, with the browser still loading the emitted `public/app.js` asset.

## Source Layout

Current authoring layout:

- `src/core/` - shared config, DB, types, and config tests
- `src/core/config/` - internal config helpers for env resolution, validation, and preflight issue mapping
- `src/server/` - server entrypoint plus server-only helpers for preflight, prompt shaping, turn sanitization, and debug payloads
- `src/state/` - game state mutation and retrieval
- `src/story/` - director and quest specs plus progression helpers
- `src/rules/` - validation rules
- `src/ai/` - AI service integration
- `src/utils/` - local helper utilities such as assist text logic
- `src/ui/` - browser TypeScript authoring source
- `public/` - static browser assets plus emitted `app.js`

Legacy path translation for older notes and backlog entries:

- `src/server.ts` -> `src/server/index.ts`
- `src/config.ts` -> `src/core/config.ts`
- `src/db.ts` -> `src/core/db.ts`
- `src/types.ts` -> `src/core/types.ts`
- `src/game.ts` -> `src/state/game.ts`
- `src/director.ts` -> `src/story/director.ts`
- `src/quest.ts` -> `src/story/quest.ts`
- `src/validator.ts` -> `src/rules/validator.ts`
- `src/assist.ts` -> `src/utils/assist.ts`
- `src/ai.ts` -> `src/ai/service.ts`
- `public/app.ts` -> `src/ui/app.ts`

## Local Development

The normal development loop now runs the server directly from TypeScript:

```bash
npm install
npm run type-check
npm run dev
```

Useful commands:

```bash
npm run type-check
npm run test:config
npm run build
npm run db:migrate
npm run db:reset
npm run dev
npm start
npm test
```

What each command does:

- `npm run type-check` validates all TypeScript source in `src/`
- `npm run test:config` runs the focused config-module checks after type-checking
- `npm run build` compiles the server to `dist/` and rebuilds the browser asset at `public/app.js`
- `npm run db:migrate` compiles the server and applies any pending SQLite migrations to `data/game.db`
- `npm run db:reset` compiles the server, removes the current SQLite DB files, and reapplies the baseline migrations
- `npm run dev` rebuilds the browser asset once, then starts the TypeScript server directly through `tsx`
- `npm start` runs the compiled server from `dist/server.js`
- `npm test` runs type-checking first, then executes the TypeScript tests directly

Current limitation of the browser asset path:

- `npm run dev` rebuilds `public/app.js` when it starts, but it does not yet watch `src/ui/app.ts` continuously during the same session

## Docker And Launcher Runtime

Use Docker and the Windows launcher to exercise the compiled runtime path that later packaging work will depend on.

The default Docker stack is now:

- app
- LiteLLM sidecar
- `ollama` sidecar

An optional developer override keeps the same repo-managed `ollama` service but adds NVIDIA GPU passthrough for local inference.

Required host tool:

- Docker Desktop on Windows or macOS, or Docker Engine with Compose on Linux

Primary compiled-runtime command:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Then open `http://localhost:3000`.

What this gives you:

- Node 22 is pinned inside the container
- `better-sqlite3` builds inside the container instead of on the host
- LiteLLM starts inside the same Compose project by default, so you no longer need to launch it separately for the supported Docker path
- the default LiteLLM template now routes the stable `game-chat` and `game-embedding` aliases to the repo-managed Docker `ollama` service for a fast local smoke path
- the LiteLLM sidecar now bakes the repo-owned config files into its image so startup does not depend on fragile single-file bind mounts from secondary Windows drives
- the Docker image builds the browser asset and compiled server output up front, then runs `dist/server.js`
- the app source is baked into the image so startup works even when Docker bind mounts from a Windows secondary drive are flaky
- the SQLite database lives in a Docker volume so app state can survive container restarts without hiding the built-in spec files
- the same compiled DB migration and reset commands can be run inside the app container when you need deterministic local recovery

Current limitation of the Docker runtime path:

- source edits require a rebuild because the app is not bind-mounted into the container

GPU-backed Docker command:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

This starts the normal app, LiteLLM, and Ollama stack and reserves NVIDIA GPU access for the Ollama service. The app and LiteLLM containers themselves do not need GPU access.

The authoritative local-GPU profile matrix for manual larger-model tuning still lives in [scripts/local-gpu-profile-matrix.json](/g:/text-game/scripts/local-gpu-profile-matrix.json). T02g defines three VRAM tiers keyed by detected memory first: `local-gpu-8gb`, `local-gpu-12gb`, and `local-gpu-20gb-plus`.

On Windows, the launcher wraps the same compiled Docker path and opens the browser for you:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

## Database Reset And Recovery

The app now uses explicit SQLite migrations through [db.ts](/g:/text-game/src/core/db.ts) instead of relying only on incidental table creation during server startup.

For a normal local reset on a host Node.js workflow:

```bash
npm run db:reset
```

For the supported Docker runtime path:

```bash
docker compose run --rm --no-deps app npm run db:migrate
docker compose run --rm --no-deps app npm run db:reset
```

What those do:

- `db:migrate` applies any pending migrations and leaves existing data in place
- `db:migrate` now creates a timestamped backup in `data/backups/` before applying pending migrations to an existing database
- `db:reset` now creates a timestamped backup in `data/backups/` before removing `game.db` plus SQLite sidecar files such as `-wal` and `-shm`, then reapplies the baseline migrations

After a reset, restart the app with your normal path:

- `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build`
- `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`
- `npm run dev`

## Install Node.js And npm

You need a local Node.js install for the direct TypeScript development loop. This project expects Node.js 22 LTS. `npm` is included with standard Node.js installs.

Official references:

- [Node.js downloads](https://nodejs.org/en/download)
- [Node.js release lines and LTS status](https://nodejs.org/en/download/releases/)
- [npm overview](https://nodejs.org/en/learn/getting-started/an-introduction-to-the-npm-package-manager)

### Windows

1. Open the official Node.js downloads page.
2. Download the Windows `.msi` installer for the current LTS release that matches your machine (`x64` for most PCs, `arm64` for ARM devices).
3. Run the installer with the default options.
4. Close and reopen PowerShell or Command Prompt.
5. Verify the install:

```powershell
node -v
npm -v
```

If both commands print versions, you are ready to run the repo.

### macOS

Use one of these paths:

1. Official installer:
   Download the macOS `.pkg` for the current LTS release from the official downloads page, run it, then reopen Terminal.
2. Homebrew:

```bash
brew install node
```

Then verify:

```bash
node -v
npm -v
```

If you use Apple Silicon, prefer the `arm64` installer when downloading directly.

### Linux

Use one of these paths:

1. Official binaries or package-manager options from the Node.js downloads page if you want the Node project's current release line directly.
2. Your distribution package manager if it provides a recent enough Node.js LTS for your workflow.

After install, verify:

```bash
node -v
npm -v
```

If your distro package is too old for current packages, use the official download options instead of the distro default.

## Quick Start

1. Copy `.env.example` to `.env` and start with the LiteLLM gateway settings unless you intentionally need a different provider mode.
1. Start the default Docker stack and make sure the repo-managed `ollama` service has `gemma3:4b` plus `embeddinggemma` pulled for the default Docker smoke route.
1. For local development, run:

```bash
npm install
npm run type-check
npm run dev
```

1. Open `http://localhost:3000`.

For the compiled runtime smoke path, use:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

That one command now starts both the app and the default LiteLLM proxy sidecar.

Useful Docker commands:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
docker compose -f docker-compose.yml -f docker-compose.gpu.yml logs -f app
docker compose -f docker-compose.yml -f docker-compose.gpu.yml logs -f litellm
docker compose -f docker-compose.yml -f docker-compose.gpu.yml down
```

If port `3000` is already in use on your machine, you can still set `PORT` for that shell session before starting:

```powershell
$env:PORT = "3300"
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

On Windows, the repo now has a one-command launcher:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

The launcher now always uses the GPU-backed Docker path and blocks early if `nvidia-smi` or the Docker NVIDIA runtime is unavailable on the host.

Or, if `npm` is already installed and on `PATH`:

```bash
npm run dev:windows
```

The launcher:

- checks Docker and Compose
- confirms Docker is using the Linux container runtime required by the supported path
- reuses shared PowerShell helper functions from `scripts/lib/shared.ps1` for dotenv parsing and HTTP readiness checks
- reads `.env` when present
- falls back to the GPU-backed LiteLLM defaults when `.env` is missing
- uses the LiteLLM stack for the supported Docker launcher modes even if an older `.env` still contains a direct-provider experiment
- starts the default LiteLLM sidecar and GPU-backed Ollama service for the supported Docker path
- blocks early if host NVIDIA tooling or the Docker NVIDIA runtime is missing
- checks that the repo `data/` path is writable and warns or blocks early when disk headroom is too low
- checks for a default browser handler before auto-opening the play surface unless you use `-NoBrowser`
- clears any previous `text-game` compose app container before starting the fresh app instance
- automatically picks a free local port for that run if the configured port is already occupied by another service
- starts the app and any required Compose dependencies through `docker compose`
- waits for the app container to become healthy, confirms the player surface is actually being served, then opens the browser automatically
- stops early with a plain error when an explicitly configured external local AI URL is unreachable

Current disk-headroom policy for launcher and runtime preflight:

- below `512 MB` free on the app-data drive is a `blocker`
- below `2 GB` free on the app-data drive is a `warning`

Useful flags:

- `-NoBrowser` skips opening the webpage
- `-Rebuild` forces a Docker image rebuild before launch

## Script Layout

Script organization is now split between small entry scripts and shared helpers:

- `scripts/start-dev.ps1` - launcher orchestration
- `scripts/test-local-ai-workflow.ps1` - local AI contract harness
- `scripts/start-desktop-prototype.ps1` - Electron prototype wrapper
- `scripts/lib/shared.ps1` - shared PowerShell helpers for dotenv parsing, config lookup, URI handling, and HTTP readiness checks
- `scripts/lib/shared.ps1` now also owns the shared AI config-resolution logic used by both the launcher and the local AI harness

When you add script behavior, prefer extending `scripts/lib/` if another script could reuse the same logic later. This keeps debugging centralized instead of scattering slightly different copies across multiple launchers.

The launcher respects `PORT` from your PowerShell session or `.env`. If that port is already taken by another local service, the launcher now falls back to a nearby free port for that run and prints the chosen URL before opening the browser.

## Default LiteLLM Gateway Path

The app only needs one stable AI contract:

- `game-chat`
- `game-embedding`

Keep those alias names in `.env`. When you want to change where requests go, change the LiteLLM proxy config instead of teaching the app new provider-specific names.

Recommended baseline:

1. Copy `.env.example` to `.env`.
1. Keep `AI_PROVIDER=litellm`, `LITELLM_CHAT_MODEL=game-chat`, and `LITELLM_EMBEDDING_MODEL=game-embedding`.
1. Pull the default Docker-Ollama models once:

```bash
docker compose exec ollama ollama pull gemma3:4b
docker compose exec ollama ollama pull embeddinggemma
```

1. Start the Docker stack with `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build` or `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`.
1. Start the app with `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build`, `npm run dev`, or `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`.

Current default Docker smoke guidance:

- keep the app on LiteLLM and let LiteLLM route the stable aliases to the repo-managed Docker `ollama` service by default
- keep `game-chat` on `gemma3:4b` and `game-embedding` on `embeddinggemma` for the simplest repo-local smoke test
- if you want to move back to hosted providers, repoint the upstream targets in `litellm.config.yaml` without changing the app-facing alias names

Optional larger local-model path through the same gateway UX:

- keep the app on `AI_PROVIDER=litellm`
- leave the app-facing aliases as `game-chat` and `game-embedding`
- use `docker-compose.gpu.yml` whenever you need the Docker NVIDIA reservation on a raw Compose run
- use `litellm.local-gpu.config.yaml` only for manual larger-model experiments; the default launcher now keeps the normal LiteLLM config and only adds the GPU reservation

Current VRAM-tier matrix for manual larger-model tuning:

- `local-gpu-8gb` uses `gemma3:4b` for chat and keeps `game-embedding` on hosted `text-embedding-3-small`; if that route is still too heavy, `gemma3:1b` is only a smoke-test fallback, not a supported matrix tier
- `local-gpu-12gb` uses `gemma3:12b` for chat and keeps `game-embedding` on hosted `text-embedding-3-small`; fall back to `local-gpu-8gb` if startup reliability is worse than the smaller tier
- `local-gpu-20gb-plus` uses `gemma3:27b` for chat and can route `game-embedding` to local `embeddinggemma`; fall back to `local-gpu-12gb` or switch embeddings back to hosted if the local embedding route is unavailable or too slow

VRAM remains the selector of record. GPU marketing names are only examples for documentation and must not override detected memory.

Manual selection order for the larger-model GPU matrix:

1. `LOCAL_GPU_PROFILE_ID` if you set it explicitly
2. `LOCAL_GPU_VRAM_GB` if you provide a manual VRAM value
3. detected host NVIDIA VRAM via `nvidia-smi`
4. guided manual selection instead of a silent guess if none of the above can choose a supported tier

That keeps the player-facing and app-facing setup stable even when the upstream model stack changes.

## Config Precedence

The runtime config module now applies one consistent precedence order instead of making each caller guess:

- `AI_PROFILE` picks a small supported startup profile first: `local-gpu-small`, `local-gpu-large`, or `custom`
- when the selected profile is not `custom`, its defaults seed the AI provider and model contract before plain runtime defaults apply
- provider-specific env vars win when `AI_PROVIDER` is `litellm` or `ollama`
- generic `AI_*` vars are the next fallback
- legacy `OPENAI_*` names remain supported as the last fallback during migration
- blank values are treated as unset, so provider defaults still apply when a field is optional

The intended setup flow is now:

1. pick `AI_PROFILE`
2. start with the profile defaults
3. add explicit env overrides only when you need advanced behavior

Current profiles:

- `local-gpu-small` - the normal supported Docker LiteLLM path aligned with the conservative 8 GB GPU tier guidance
- `local-gpu-large` - the larger documented GPU tier guidance for manual tuning
- `custom` - skip starter defaults and drive setup with validated explicit env vars instead

Provider selection now behaves like this:

- explicit `AI_PROVIDER` always wins
- when `AI_PROFILE` is not `custom` and `AI_PROVIDER` is unset, the selected profile supplies the starting provider
- if `AI_PROVIDER` is unset, existing `LITELLM_*`, `OLLAMA_*`, or legacy direct-provider env vars are inferred so older setups keep working
- if nothing provider-specific is configured, the app defaults to `litellm`

Examples:

- in LiteLLM mode, `LITELLM_CHAT_MODEL` overrides `AI_CHAT_MODEL`, which overrides `OPENAI_MODEL`
- in Ollama mode, `OLLAMA_BASE_URL` overrides `AI_BASE_URL`, which overrides `OPENAI_BASE_URL`
- in default OpenAI-compatible mode, `AI_API_KEY` overrides `OPENAI_API_KEY`
- runtime diagnostics and the browser setup panel now show which startup profile is active and which explicit env vars override it

## Desktop Packaging Prototype

The current packaging spike uses Electron as a thin Windows-first shell around the existing compiled server and browser UI.

### MVP packaged AI contract

For the MVP playtest path, the packaged app and the AI runtime are intentionally split:

- the Electron shell bundles the app window and compiled local game server
- Docker Desktop remains a required Windows prerequisite for AI startup
- LiteLLM continues to run as the repo-managed Docker sidecar instead of being embedded into the packaged shell
- the GPU-backed Docker Ollama path is the default supported packaged setup contract

Why keep that split for now:

- it preserves one AI contract across the Windows launcher, setup flow, and packaged shell
- it avoids shipping and supporting two different LiteLLM ownership models during Phase 0
- it keeps T36 focused on the playtest shell and first-run clarity instead of silently turning into a gateway repackaging project

What the packaged path should tell the player in plain language:

- if Docker Desktop is missing or not running: install or start Docker Desktop, then retry the game
- if the LiteLLM sidecar did not become ready: the game app opened, but the AI service is still starting or failed to start; retry after Docker is healthy
- if the player machine cannot satisfy the GPU-backed path: install the required NVIDIA/WSL2 prerequisites first before retrying

The packaged MVP does **not** bundle LiteLLM or Ollama yet. That may change later, but T36 should assume the supported AI startup contract is still Docker Desktop plus the repo-managed LiteLLM stack.

Prototype commands once Node.js and npm are available on the host:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-desktop-prototype.ps1
```

```bash
npm run desktop:prototype:dev
npm run desktop:prototype:dir
```

What the prototype does:

- builds the existing TypeScript server and browser asset
- stages `dist/`, `public/`, and `data/spec/` into Electron's writable user-data area
- looks for `.env` beside the executable first, then in Electron user data, then in the repo root during development
- starts the compiled local server with Electron's bundled runtime
- waits for `/api/state` readiness and then opens the existing player UI in a native window

Current prototype caveats:

- this path is experimental and was added to de-risk packaging direction rather than replace the documented Docker launcher today
- the MVP packaged playtest path still depends on Docker Desktop for AI startup; the app shell is bundled, but the AI gateway is not
- code signing, icons, installer polish, and first-run config repair UX are still follow-on work
- containerized packaging verification passed in this session with `docker compose run --rm app npm run desktop:prototype:dir`, and a host Windows dry run was completed on 2026-03-08; see `packaging/decision-memo.md` for the validation details

See `packaging/decision-memo.md` for the option comparison, save or log implications, and the clean-machine smoke checklist.

The browser UI includes:

- a text log for player and narrator turns
- player naming plus a multiline turn input with local assist chips
- a startup setup panel that uses one shared preflight contract with `blocker`, `warning`, and `info` issues before the first turn
- a fatal-error panel that catches unexpected browser crashes and tells the player to refresh or restart instead of leaving a dead screen
- `Refresh State` and `New Session` controls for quick local iteration
- a debug panel showing the active provider/model config, current player state, and the last turn payload returned by the server

For a Windows-only local model setup, use [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md).

For local AI regression checks, run `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`.

For local GPU matrix consistency checks, run `powershell -ExecutionPolicy Bypass -File scripts/validate-local-gpu-profile-matrix.ps1`.

## Key Files

- `src/server/index.ts` - API server entrypoint and routing
- `src/core/logging.ts` - structured server logging with levels and secret redaction
- `src/server/runtime-preflight.ts` - cached startup probe and AI readiness checks
- `src/server/host-preflight.ts` - runtime host and storage prerequisite checks for writable paths and disk headroom
- `src/server/debug.ts` - runtime, session, and turn debug payload shaping
- `src/server/turn-result.ts` - model output sanitization defaults
- `src/server/player-state.ts` - player director-state normalization helpers
- `src/core/config.ts` - runtime config and provider-neutral AI settings
- `src/core/config/env.ts` - env resolution, defaults, diagnostics, and public runtime config shaping
- `src/core/config/validation.ts` - config validation and human-readable error formatting
- `src/core/config/preflight.ts` - player-facing config preflight issue mapping and report helpers
- `src/ai/service.ts` - OpenAI-compatible chat completions + JSON schema
- `src/state/game.ts` - State, memory, director updates + retrieval scoring
- `src/utils/assist.ts` - Local spellcheck + autocomplete
- `src/rules/validator.ts` - Spec and update validation
- `src/ui/app.ts` - browser TypeScript source
- `public/app.js` - emitted browser asset loaded by `index.html`; do not hand-edit
- `ROADMAP.md` - Roadmap, tracker, blockers
- `AI_CONTROL.md` - Director/AI control system design
- `ARCHITECTURE.md` - provider strategy and integration direction
- `TOOLS.md` - Control endpoints and spec reloads

## Environment

- `AI_PROVIDER` - optional label; defaults to `litellm`; supported repo presets are `openai-compatible`, `litellm`, and `ollama`
- `AI_PROFILE` - optional starter profile; defaults to `local-gpu-small`; supported values are `local-gpu-small`, `local-gpu-large`, and `custom`
- `AI_API_KEY` - primary key for generic OpenAI-compatible mode
- `AI_BASE_URL` - optional; point this at any OpenAI-compatible provider endpoint
- `AI_CHAT_MODEL` - defaults to `gpt-4o-mini`
- `AI_EMBEDDING_MODEL` - defaults to `text-embedding-3-small`
- `LITELLM_PROXY_URL` - LiteLLM proxy URL when `AI_PROVIDER=litellm`
- `LITELLM_API_KEY` - LiteLLM proxy key; defaults to `anything` when unset
- `LITELLM_CHAT_MODEL` - LiteLLM chat alias; defaults to `game-chat`
- `LITELLM_EMBEDDING_MODEL` - LiteLLM embedding alias; defaults to `game-embedding`
- `OLLAMA_BASE_URL` - Ollama OpenAI-compatible base URL when `AI_PROVIDER=ollama`; defaults to `http://127.0.0.1:11434/v1`
- `OLLAMA_API_KEY` - optional Ollama key placeholder; defaults to `ollama`
- `OLLAMA_CHAT_MODEL` - Ollama chat model; defaults to `gemma3:4b`
- `OLLAMA_EMBEDDING_MODEL` - Ollama embedding model; defaults to `embeddinggemma`
- `LOG_LEVEL` - server log threshold; use `debug`, `info`, `warn`, or `error`; defaults to `info`
- Legacy `OPENAI_*` env vars still work during migration, but new setup should prefer LiteLLM or an explicit `AI_PROVIDER`

### Docker note for local AI

When the app runs in Docker, `localhost` inside the container is not your host machine.

- For the repo-managed Docker `ollama` service, use `OLLAMA_BASE_URL=http://ollama:11434/v1`
- For LiteLLM in Docker, use `LITELLM_PROXY_URL=http://host.docker.internal:4000`
- For any other local OpenAI-compatible gateway, use `host.docker.internal` instead of `127.0.0.1` or `localhost`

The Windows launcher auto-translates local host URLs to Docker-reachable URLs for the container path. Raw `docker compose` usage expects your `.env` values to already be Docker-safe.

### Docker note for Windows repo drives

If Docker Desktop cannot mount the drive that contains this repo, the container now falls back to the copy baked into the image.

- startup still works through `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build` or `scripts/start-dev.ps1`
- live source edits are not reflected until you rebuild
- this fallback is meant to keep launch reliable while later tasks improve the packaged path

### Provider notes

- Default setup goes through LiteLLM.
- Use LiteLLM to route hosted providers for the main turn path and smaller helper tasks.
- Keep the app configured against `game-chat` and `game-embedding`; swap proxy upstreams instead of app-facing alias names.
- If you need direct OpenAI-compatible mode, set `AI_PROVIDER=openai-compatible`, then provide `AI_API_KEY` and any model or base URL overrides.
- For an optional larger local-model path, prefer keeping `AI_PROVIDER=litellm` and routing the local model behind LiteLLM; if you need a direct smoke-test-only route, set `AI_PROVIDER=ollama` and follow [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md).
- Best compatibility comes from providers that support:
  - `POST /v1/chat/completions` or an equivalent compatible generation endpoint
  - JSON schema response formatting
  - embeddings endpoints for memory retrieval
- Examples of providers/gateways you can often target this way include OpenRouter, Together, Groq-compatible gateways, and local OpenAI-style gateways such as Ollama or LM Studio adapters.

If you want maximum provider portability, avoid provider-specific features in the main turn pipeline unless they are wrapped behind a fallback layer.

## LiteLLM

LiteLLM is the default setup path for this project.

The app should talk to LiteLLM first. LiteLLM can then route hosted providers for smaller helper tasks and the main turn path, or route to optional larger local-model paths behind the same interface.

Recommended local setup:

1. Use the included [litellm.config.yaml](./litellm.config.yaml) as the default Docker-Ollama template.
2. Keep `AI_PROVIDER=litellm`, `LITELLM_CHAT_MODEL=game-chat`, and `LITELLM_EMBEDDING_MODEL=game-embedding` in `.env`.
3. Pull `gemma3:4b` and `embeddinggemma` into the repo-managed Docker `ollama` service.
4. Start the supported Docker path with `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build` or `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`.
5. Keep `LITELLM_MASTER_KEY` equal to `LITELLM_API_KEY` in `.env`. The default Docker smoke path now uses `anything` for both unless you override them together.

The runtime automatically prefers LiteLLM-specific env vars when `AI_PROVIDER=litellm`, and now falls back to LiteLLM as the blank-slate default when no provider-specific env is configured.

The included template now keeps both aliases on the repo-managed Docker `ollama` service for the default Docker smoke path. The LiteLLM container also starts with `--drop_params` so Ollama-backed embeddings do not fail on unsupported OpenAI-compatible extras such as `encoding_format`. When you want an optional larger local-model route, use the included `litellm.local-gpu.config.yaml` path through the Docker GPU override or mirror that pattern in your own LiteLLM config while leaving the alias names alone so the app contract stays stable.

The included local-GPU config now tracks the `local-gpu-8gb` matrix profile by default. Higher-tier manual swap references for `local-gpu-12gb` and `local-gpu-20gb-plus` are left in the file as commented guidance until launcher or UI selection work lands.

## Windows Local AI

The repo includes an optional Docker GPU override intended for larger local-model experiments on Windows dev machines. The recommended gateway-aligned route is to keep the app on LiteLLM and place the local model behind the `game-chat` alias. A direct `AI_PROVIDER=ollama` path still exists for smoke tests when you want the thinnest possible local loop.

The direct preset keeps the same OpenAI-compatible adapter boundary and only swaps config defaults:

- set `AI_PROFILE=custom` so startup diagnostics treat the direct-provider path as an intentional advanced override
- chat model default: `gemma3:4b`
- embedding model default: `embeddinggemma`
- base URL default: `http://127.0.0.1:11434/v1`

When the app runs in Docker against Ollama on your Windows host, switch the direct Ollama base URL to `http://host.docker.internal:11434/v1`.

Setup steps and GPU notes live in [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md). Treat the local-model path as optional, not as the default small-task or end-user setup.

The first-pass VRAM-tier matrix is intentionally conservative and uses one chat family across all supported tiers:

- `local-gpu-8gb` -> `gemma3:4b` chat, hosted embeddings, `verified`
- `local-gpu-12gb` -> `gemma3:12b` chat, hosted embeddings, `heuristic`
- `local-gpu-20gb-plus` -> `gemma3:27b` chat, local `embeddinggemma` allowed, `heuristic`

Artifact-size references for those recommendations come from the official Ollama library pages for [gemma3:4b](https://ollama.com/library/gemma3:4b), [gemma3:12b](https://ollama.com/library/gemma3:12b), [gemma3:27b](https://ollama.com/library/gemma3:27b), and [embeddinggemma](https://ollama.com/library/embeddinggemma). Usable VRAM headroom must be higher than the raw artifact size.

For the Docker-backed GPU path, the quickest Windows startup path is:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

## AI Workflow Test Loop

Use a test-first loop as the default workflow for prompt, schema, adapter, retrieval, and director-rule changes:

1. Add or tighten a test, fixture, replay case, or harness assertion that captures the desired behavior.
2. Run `npm run type-check` and that focused check first so the missing behavior or coverage gap is visible.
3. Run `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` before changing AI behavior when a compatible local provider is available.
4. Make the smallest change.
5. Re-run `npm run type-check`, then re-run the focused check, then re-run the same local AI harness immediately after the change.
6. Only move on to broader app testing after the type-check, focused check, and harness all pass.

If `npm` is available on your machine, the same check is exposed as `npm run test:local-ai`.

## Assist Endpoint

`POST /api/assist` returns lightweight, local spellcheck and autocomplete suggestions so you can reduce token use in the main model.

## Web Debug Surface

The browser client is intentionally useful for local AI debugging:

- `GET /api/state` returns the current player plus safe runtime/session debug data
- runtime debug now includes a non-secret `preflight` block with one shared contract:
  - `status`: `checking`, `ready`, or `action-required`
  - `issues`: each issue has `severity`, `area`, `title`, `message`, `recommended_fix`, `env_vars`, and optional advanced `details`
  - `counts`: blocker/warning/info totals so the launcher and browser can decide whether play should stay blocked
- host and storage preflight now covers writable app-data path checks plus low-disk warnings or blockers before the first turn
- storage preflight now also checks whether the saved-game database can be opened safely, whether SQLite reports corruption, and whether existing player metadata is still valid JSON before the first turn
- runtime debug now also includes a non-secret `config_diagnostics` block showing whether each resolved config value came from provider-specific, generic, legacy, or default config paths
- `POST /api/turn` returns the narrator payload plus safe debug details such as request id, latency, prompt preview, embedding fallback status, validation result, and before/after player state
- API keys are not returned by the debug payload; only non-secret runtime metadata is exposed

At startup, the server now prints a safe config summary plus a source summary so invalid env state is visible immediately without leaking credentials.

Server logs now emit structured JSON lines with:

- `time`, `level`, and `message`
- request context such as `requestId`, `method`, and `route`
- automatic redaction for common secret fields such as `authorization`, `apiKey`, `token`, `password`, `cookie`, and `secret`
- one process-level fatal-error shutdown path for uncaught exceptions and unhandled promise rejections so unexpected crashes are logged before the server exits

Set `LOG_LEVEL=debug` when you need request-start events and lower-signal debugging detail during local troubleshooting.

## Startup Recovery

First-turn setup problems now split into two paths:

- the Windows launcher reports preflight issues using the same `blocker`, `warning`, and `info` language as the app runtime
- the browser shows a setup panel when config is incomplete or the server can prove the configured model names do not exist on the AI service
- LiteLLM startup checks now distinguish proxy-auth mismatch, upstream credential failure, alias mismatch, and missing local-model cases instead of collapsing them into one generic AI error

Current severity policy:

- `blocker` means the first turn stays disabled until the issue is fixed
- `warning` means the app can continue, but the setup still needs attention
- `info` means the app is ready and the note is only there to explain inferred or non-default behavior

Advanced setup details are available behind expandable UI sections so end users see one recommended fix first, while developers can still inspect config sources and exact probe targets.

Common fixes:

- add `AI_API_KEY` or `OPENAI_API_KEY` when `AI_PROVIDER=openai-compatible`
- use a full AI base URL such as `https://api.openai.com/v1`, `http://127.0.0.1:4000`, or `http://127.0.0.1:11434/v1`
- when the app runs in Docker against a host-local AI service, use `host.docker.internal` instead of `localhost`
- if LiteLLM reports a proxy-auth setup mismatch, set `LITELLM_MASTER_KEY` to the same value as `LITELLM_API_KEY`, or clear both if you do not want proxy auth enabled
- if LiteLLM reports upstream credential failure, fix the provider key behind LiteLLM or repoint the upstream route to a reachable local model
- if LiteLLM or Ollama reports different model names than the ones in `.env`, update the configured chat and embedding model vars to match
- if the GPU-backed Docker path reports a missing local model, pull the required Ollama model and retry the launcher
- if the launcher reports missing GPU tooling, install or repair the NVIDIA driver stack until `nvidia-smi` works in PowerShell
- if the launcher or runtime reports low disk space, free up space on the drive that contains the app `data/` folder before starting another session
- if the launcher or runtime reports an unwritable app-data path, fix the folder permissions or move the repo to a writable location before retrying
- if the launcher or runtime reports an unreadable or corrupted saved-game database, restore the latest copy from `data/backups/` or move the damaged DB out of `data/` before retrying
- if the launcher or runtime reports corrupted save metadata, restore the affected save from `data/backups/` or remove the damaged local save before retrying
