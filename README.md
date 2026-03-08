# Text Game

A portable, text-based adventure with a director layer that nudges the story toward a defined end goal while letting the player attempt anything.

The project uses the OpenAI Node SDK through a provider-neutral config layer, so you can keep the same app code while swapping between providers that support OpenAI-compatible generation and embeddings endpoints.

## Preferred Dev Runtime

The preferred development path is Docker. The app server, `npm install`, and all Node-based commands should run inside containers so host Node/npm versions and native addon toolchains do not block startup.

Required host tool:

- Docker Desktop on Windows or macOS, or Docker Engine with Compose on Linux

Primary startup command:

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

What this gives you:

- Node 22 is pinned inside the container
- `better-sqlite3` builds inside the container instead of on the host
- `node_modules` live in a Docker volume, not on the host
- the repo source and SQLite data stay mounted from your working tree

On Windows, the launcher wraps the same Docker path and opens the browser for you:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

## Install Node.js And npm

You only need a local Node.js install if you explicitly want to run the app outside Docker. The recommended path is still Docker.

If you do want a host install, this project expects Node.js 22 LTS. `npm` is included with standard Node.js installs.

Official references:

- Node.js downloads: https://nodejs.org/en/download
- Node.js release lines and LTS status: https://nodejs.org/en/download/releases/
- npm overview: https://nodejs.org/en/learn/getting-started/an-introduction-to-the-npm-package-manager

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

1. Copy `.env.example` to `.env` and choose either hosted API credentials or the local AI settings you want.
2. Start the app in Docker:

```bash
docker compose up --build
```

3. Open `http://localhost:3000`.

Useful Docker commands:

```bash
docker compose up --build
docker compose up -d
docker compose logs -f app
docker compose down
```

On Windows, the repo now has a one-command launcher:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

Or, if `npm` is already installed and on `PATH`:

```bash
npm run dev:windows
```

The launcher:

- checks Docker and Compose
- reads `.env` when present
- falls back to the local Ollama preset for that run when `.env` is missing
- checks the configured AI path and starts local Ollama when possible
- starts the app container through `docker compose`
- waits for the app to respond, then opens the browser automatically

Useful flags:

- `-NoBrowser` skips opening the webpage
- `-Rebuild` forces a Docker image rebuild before launch

The browser UI includes:

- a text log for player and narrator turns
- player naming plus a multiline turn input with local assist chips
- `Refresh State` and `New Session` controls for quick local iteration
- a debug panel showing the active provider/model config, current player state, and the last turn payload returned by the server

For a Windows-only local model setup, use [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md).

For local AI regression checks, run `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`.

## Key Files

- `src/server.js` - API server and routing
- `src/config.js` - runtime config and provider-neutral AI settings
- `src/ai.js` - OpenAI-compatible chat completions + JSON schema
- `src/game.js` - State, memory, director updates + retrieval scoring
- `src/assist.js` - Local spellcheck + autocomplete
- `src/validator.js` - Spec and update validation
- `public/` - Web UI
- `ROADMAP.md` - Roadmap, tracker, blockers
- `AI_CONTROL.md` - Director/AI control system design
- `ARCHITECTURE.md` - provider strategy and integration direction
- `TOOLS.md` - Control endpoints and spec reloads

## Environment

- `AI_PROVIDER` - optional label; defaults to `openai-compatible`; supported repo presets are `openai-compatible`, `litellm`, and `ollama`
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
- Legacy `OPENAI_*` env vars still work for backward compatibility

### Docker note for local AI

When the app runs in Docker, `localhost` inside the container is not your host machine.

- For Ollama in Docker, use `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`
- For LiteLLM in Docker, use `LITELLM_PROXY_URL=http://host.docker.internal:4000`
- For any other local OpenAI-compatible gateway, use `host.docker.internal` instead of `127.0.0.1` or `localhost`

The Windows launcher auto-translates local host URLs to Docker-reachable URLs for the container path. Raw `docker compose` usage expects your `.env` values to already be Docker-safe.

### Provider notes

- Default setup works with OpenAI directly.
- To use another OpenAI-compatible provider, set `AI_BASE_URL` and update the model names.
- For a local Windows smoke-test path, set `AI_PROVIDER=ollama` and follow [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md).
- Best compatibility comes from providers that support:
  - `POST /v1/chat/completions` or an equivalent compatible generation endpoint
  - JSON schema response formatting
  - embeddings endpoints for memory retrieval
- Examples of providers/gateways you can often target this way include OpenRouter, Together, Groq-compatible gateways, and local OpenAI-style gateways such as Ollama or LM Studio adapters.

If you want maximum provider portability, avoid provider-specific features in the main turn pipeline unless they are wrapped behind a fallback layer.

## LiteLLM

LiteLLM is now a first-class setup path for this project.

Recommended local setup:

1. Run a LiteLLM proxy and point it at your upstream model providers.
2. Use the included [litellm.config.yaml](./litellm.config.yaml) as a starting point.
3. Set `AI_PROVIDER=litellm` in `.env`.
4. Set `LITELLM_PROXY_URL=http://127.0.0.1:4000`.
5. Set `LITELLM_CHAT_MODEL=game-chat` and `LITELLM_EMBEDDING_MODEL=game-embedding`.

The runtime will automatically prefer LiteLLM-specific env vars when `AI_PROVIDER=litellm`, while still using the same game turn pipeline.

## Windows Local AI

The repo now includes an `ollama` preset intended for local smoke tests on Windows dev machines. It keeps the same OpenAI-compatible adapter boundary and only swaps config defaults:

- chat model default: `gemma3:4b`
- embedding model default: `embeddinggemma`
- base URL default: `http://127.0.0.1:11434/v1`

Setup steps and download links live in [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md). Treat this path as a cheap local test harness, not as the default production-quality model setup.

Once Ollama and the models are installed, the quickest Windows startup path is `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`.

If you use raw Docker commands instead of the launcher, prefer `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1` in `.env`.

## AI Workflow Test Loop

Use a test-first loop as the default workflow for prompt, schema, adapter, retrieval, and director-rule changes:

1. Add or tighten a test, fixture, replay case, or harness assertion that captures the desired behavior.
2. Run that focused check first so the missing behavior or coverage gap is visible.
3. Run `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` before changing AI behavior when a compatible local provider is available.
4. Make the smallest change.
5. Re-run the focused check, then re-run the same local AI harness immediately after the change.
6. Only move on to broader app testing after the focused check and harness both pass.

If `npm` is available on your machine, the same check is exposed as `npm run test:local-ai`.

## Assist Endpoint

`POST /api/assist` returns lightweight, local spellcheck and autocomplete suggestions so you can reduce token use in the main model.

## Web Debug Surface

The browser client is intentionally useful for local AI debugging:

- `GET /api/state` returns the current player plus safe runtime/session debug data
- `POST /api/turn` returns the narrator payload plus safe debug details such as request id, latency, prompt preview, embedding fallback status, validation result, and before/after player state
- API keys are not returned by the debug payload; only non-secret runtime metadata is exposed
