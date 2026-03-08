# Text Game

A portable, text-based adventure with a director layer that nudges the story toward a defined end goal while letting the player attempt anything.

The project uses the OpenAI Node SDK through a provider-neutral config layer, with LiteLLM as the default AI control plane so the same app code can target hosted providers and optional local model paths through one gateway-first contract.

The application source is TypeScript-first: server code lives in `src/*.ts`, browser source lives in `public/app.ts`, and the browser still loads the emitted `public/app.js` asset.

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
npm run dev
npm start
npm test
```

What each command does:

- `npm run type-check` validates all TypeScript source in `src/` and `public/`
- `npm run test:config` runs the focused config-module checks after type-checking
- `npm run build` compiles the server to `dist/` and rebuilds the browser asset at `public/app.js`
- `npm run dev` rebuilds the browser asset once, then starts the TypeScript server directly through `tsx`
- `npm start` runs the compiled server from `dist/server.js`
- `npm test` runs type-checking first, then executes the TypeScript tests directly

Current limitation of the browser asset path:

- `npm run dev` rebuilds `public/app.js` when it starts, but it does not yet watch `public/app.ts` continuously during the same session

## Docker And Launcher Runtime

Use Docker and the Windows launcher to exercise the compiled runtime path that later packaging work will depend on.

The default Docker stack is now:

- app
- LiteLLM sidecar

An optional developer override adds a local Ollama backend with NVIDIA GPU passthrough.

Required host tool:

- Docker Desktop on Windows or macOS, or Docker Engine with Compose on Linux

Primary compiled-runtime command:

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

What this gives you:

- Node 22 is pinned inside the container
- `better-sqlite3` builds inside the container instead of on the host
- LiteLLM starts inside the same Compose project by default, so you no longer need to launch it separately for the supported Docker path
- the LiteLLM sidecar now bakes the repo-owned config files into its image so startup does not depend on fragile single-file bind mounts from secondary Windows drives
- the Docker image builds the browser asset and compiled server output up front, then runs `dist/server.js`
- the app source is baked into the image so startup works even when Docker bind mounts from a Windows secondary drive are flaky
- the SQLite database lives in a Docker volume so app state can survive container restarts without hiding the built-in spec files

Current limitation of the Docker runtime path:

- source edits require a rebuild because the app is not bind-mounted into the container

Optional developer GPU override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

This adds an Ollama container and reserves NVIDIA GPU access for that local inference service only. The app and LiteLLM containers themselves do not need GPU access.

On Windows, the launcher wraps the same compiled Docker path and opens the browser for you:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

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
1. Put the hosted-provider key used by the included `litellm.config.yaml` template into `.env`, for example `OPENAI_API_KEY` for the default hosted route.
1. For local development, run:

```bash
npm install
npm run type-check
npm run dev
```

1. Open `http://localhost:3000`.

For the compiled runtime smoke path, use:

```bash
docker compose up --build
```

That one command now starts both the app and the default LiteLLM proxy sidecar.

Useful Docker commands:

```bash
docker compose up --build
docker compose up -d
docker compose logs -f app
docker compose logs -f litellm
docker compose down
```

If port `3000` is already in use on your machine, you can still set `PORT` for that shell session before starting:

```powershell
$env:PORT = "3300"
docker compose up --build
```

On Windows, the repo now has a one-command launcher:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

Optional developer GPU-backed local model path:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -AiStack local-gpu
```

Or, if `npm` is already installed and on `PATH`:

```bash
npm run dev:windows
```

The launcher:

- checks Docker and Compose
- reads `.env` when present
- falls back to the LiteLLM defaults when `.env` is missing
- uses the LiteLLM stack for the supported Docker launcher modes even if an older `.env` still contains a direct-provider experiment
- starts the default LiteLLM sidecar for the supported Docker path
- can opt into the local GPU override with `-AiStack local-gpu`
- clears any previous `text-game` compose app container before starting the fresh app instance
- automatically picks a free local port for that run if the configured port is already occupied by another service
- starts the app and any required Compose dependencies through `docker compose`
- waits for the app container to become healthy, confirms the player surface is actually being served, then opens the browser automatically
- stops early with a plain error when an explicitly configured external local AI URL is unreachable

Useful flags:

- `-NoBrowser` skips opening the webpage
- `-Rebuild` forces a Docker image rebuild before launch
- `-AiStack local-gpu` enables the optional Docker GPU override for a local Ollama backend

The launcher respects `PORT` from your PowerShell session or `.env`. If that port is already taken by another local service, the launcher now falls back to a nearby free port for that run and prints the chosen URL before opening the browser.

## Default LiteLLM Gateway Path

The app only needs one stable AI contract:

- `game-chat`
- `game-embedding`

Keep those alias names in `.env`. When you want to change where requests go, change the LiteLLM proxy config instead of teaching the app new provider-specific names.

Recommended baseline:

1. Copy `.env.example` to `.env`.
2. Keep `AI_PROVIDER=litellm`, `LITELLM_CHAT_MODEL=game-chat`, and `LITELLM_EMBEDDING_MODEL=game-embedding`.
3. For the included template, set `OPENAI_API_KEY` in `.env`.
4. Start the Docker stack with `docker compose up --build` or `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`.
5. Start the app with `docker compose up --build`, `npm run dev`, or `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`.

Hosted-first guidance for the current MVP path:

- keep smaller helper work such as spellcheck and autocomplete on fast hosted routes behind LiteLLM
- keep `game-embedding` on a small hosted embedding model by default for compatibility, speed, and cost
- start with the hosted `game-chat` route too, then only move it to a larger optional local model when you intentionally want that trade-off

Optional larger local-model path through the same gateway UX:

- keep the app on `AI_PROVIDER=litellm`
- leave the app-facing aliases as `game-chat` and `game-embedding`
- use `docker-compose.gpu.yml` or `-AiStack local-gpu` to start an Ollama backend with NVIDIA GPU passthrough
- let LiteLLM switch to `litellm.local-gpu.config.yaml` for `game-chat` while `game-embedding` stays hosted by default

That keeps the player-facing and app-facing setup stable even when the upstream model stack changes.

## Config Precedence

The runtime config module now applies one consistent precedence order instead of making each caller guess:

- provider-specific env vars win when `AI_PROVIDER` is `litellm` or `ollama`
- generic `AI_*` vars are the next fallback
- legacy `OPENAI_*` names remain supported as the last fallback during migration
- blank values are treated as unset, so provider defaults still apply when a field is optional

Provider selection now behaves like this:

- explicit `AI_PROVIDER` always wins
- if `AI_PROVIDER` is unset, existing `LITELLM_*`, `OLLAMA_*`, or legacy direct-provider env vars are inferred so older setups keep working
- if nothing provider-specific is configured, the app defaults to `litellm`

Examples:

- in LiteLLM mode, `LITELLM_CHAT_MODEL` overrides `AI_CHAT_MODEL`, which overrides `OPENAI_MODEL`
- in Ollama mode, `OLLAMA_BASE_URL` overrides `AI_BASE_URL`, which overrides `OPENAI_BASE_URL`
- in default OpenAI-compatible mode, `AI_API_KEY` overrides `OPENAI_API_KEY`

## Desktop Packaging Prototype

The current packaging spike uses Electron as a thin Windows-first shell around the existing compiled server and browser UI.

### MVP packaged AI contract

For the MVP playtest path, the packaged app and the AI runtime are intentionally split:

- the Electron shell bundles the app window and compiled local game server
- Docker Desktop remains a required Windows prerequisite for AI startup
- LiteLLM continues to run as the repo-managed Docker sidecar instead of being embedded into the packaged shell
- hosted-first LiteLLM routing remains the default supported packaged setup
- the optional `local-gpu` path stays an explicit opt-in for compatible Windows machines instead of becoming the baseline requirement

Why keep that split for now:

- it preserves one AI contract across the Windows launcher, setup flow, and packaged shell
- it avoids shipping and supporting two different LiteLLM ownership models during Phase 0
- it keeps T36 focused on the playtest shell and first-run clarity instead of silently turning into a gateway repackaging project

What the packaged path should tell the player in plain language:

- if Docker Desktop is missing or not running: install or start Docker Desktop, then retry the game
- if the LiteLLM sidecar did not become ready: the game app opened, but the AI service is still starting or failed to start; retry after Docker is healthy
- if the player selects the optional local GPU route on unsupported hardware: switch back to the hosted default path or install the required NVIDIA/WSL2 prerequisites first

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
- containerized packaging verification passed in this session with `docker compose run --rm app npm run desktop:prototype:dir`, but the host Windows shell path still needs a real dry run because host `node` and `npm` were unavailable here

See `packaging/decision-memo.md` for the option comparison, save or log implications, and the clean-machine smoke checklist.

The browser UI includes:

- a text log for player and narrator turns
- player naming plus a multiline turn input with local assist chips
- a startup setup panel that explains missing API keys, bad AI URLs, and common model-name mistakes before the first turn
- `Refresh State` and `New Session` controls for quick local iteration
- a debug panel showing the active provider/model config, current player state, and the last turn payload returned by the server

For a Windows-only local model setup, use [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md).

For local AI regression checks, run `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`.

## Key Files

- `src/server.ts` - API server and routing
- `src/config.ts` - runtime config and provider-neutral AI settings
- `src/ai.ts` - OpenAI-compatible chat completions + JSON schema
- `src/game.ts` - State, memory, director updates + retrieval scoring
- `src/assist.ts` - Local spellcheck + autocomplete
- `src/validator.ts` - Spec and update validation
- `public/app.ts` - browser TypeScript source
- `public/app.js` - emitted browser asset loaded by `index.html`; do not hand-edit
- `ROADMAP.md` - Roadmap, tracker, blockers
- `AI_CONTROL.md` - Director/AI control system design
- `ARCHITECTURE.md` - provider strategy and integration direction
- `TOOLS.md` - Control endpoints and spec reloads

## Environment

- `AI_PROVIDER` - optional label; defaults to `litellm`; supported repo presets are `openai-compatible`, `litellm`, and `ollama`
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
- Legacy `OPENAI_*` env vars still work during migration, but new setup should prefer LiteLLM or an explicit `AI_PROVIDER`

### Docker note for local AI

When the app runs in Docker, `localhost` inside the container is not your host machine.

- For Ollama in Docker, use `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`
- For LiteLLM in Docker, use `LITELLM_PROXY_URL=http://host.docker.internal:4000`
- For any other local OpenAI-compatible gateway, use `host.docker.internal` instead of `127.0.0.1` or `localhost`

The Windows launcher auto-translates local host URLs to Docker-reachable URLs for the container path. Raw `docker compose` usage expects your `.env` values to already be Docker-safe.

### Docker note for Windows repo drives

If Docker Desktop cannot mount the drive that contains this repo, the container now falls back to the copy baked into the image.

- startup still works through `docker compose up --build` or `scripts/start-dev.ps1`
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

1. Use the included [litellm.config.yaml](./litellm.config.yaml) as the default hosted-first template.
2. Keep `AI_PROVIDER=litellm`, `LITELLM_CHAT_MODEL=game-chat`, and `LITELLM_EMBEDDING_MODEL=game-embedding` in `.env`.
3. Put `OPENAI_API_KEY` in `.env` for the default hosted route.
4. Start the supported Docker path with `docker compose up --build` or `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`.
5. If you enable `LITELLM_MASTER_KEY`, set `LITELLM_API_KEY` in `.env` to the same value.

The runtime automatically prefers LiteLLM-specific env vars when `AI_PROVIDER=litellm`, and now falls back to LiteLLM as the blank-slate default when no provider-specific env is configured.

The included template keeps both aliases on hosted providers first. When you want an optional larger local-model route, use the included `litellm.local-gpu.config.yaml` path through the Docker GPU override or mirror that pattern in your own LiteLLM config while leaving the alias names alone so the app contract stays stable.

## Windows Local AI

The repo includes an optional Docker GPU override intended for larger local-model experiments on Windows dev machines. The recommended gateway-aligned route is to keep the app on LiteLLM and place the local model behind the `game-chat` alias. A direct `AI_PROVIDER=ollama` path still exists for smoke tests when you want the thinnest possible local loop.

The direct preset keeps the same OpenAI-compatible adapter boundary and only swaps config defaults:

- chat model default: `gemma3:4b`
- embedding model default: `embeddinggemma`
- base URL default: `http://127.0.0.1:11434/v1`

Setup steps and GPU notes live in [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md). Treat the local-model path as optional, not as the default small-task or end-user setup.

For the Docker-backed GPU path, the quickest Windows startup path is:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -AiStack local-gpu
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
- runtime debug now includes a non-secret `preflight` block with startup status, plain-language recovery steps, and the env vars involved
- runtime debug now also includes a non-secret `config_diagnostics` block showing whether each resolved config value came from provider-specific, generic, legacy, or default config paths
- `POST /api/turn` returns the narrator payload plus safe debug details such as request id, latency, prompt preview, embedding fallback status, validation result, and before/after player state
- API keys are not returned by the debug payload; only non-secret runtime metadata is exposed

At startup, the server now prints a safe config summary plus a source summary so invalid env state is visible immediately without leaking credentials.

## Startup Recovery

First-turn setup problems now split into two paths:

- the Windows launcher stops before opening the app when a configured local LiteLLM or Ollama URL is unreachable
- the browser shows a setup panel when config is incomplete or the server can prove the configured model names do not exist on the AI service

Common fixes:

- add `AI_API_KEY` or `OPENAI_API_KEY` when `AI_PROVIDER=openai-compatible`
- use a full AI base URL such as `https://api.openai.com/v1`, `http://127.0.0.1:4000`, or `http://127.0.0.1:11434/v1`
- when the app runs in Docker against a host-local AI service, use `host.docker.internal` instead of `localhost`
- if LiteLLM or Ollama reports different model names than the ones in `.env`, update the configured chat and embedding model vars to match
