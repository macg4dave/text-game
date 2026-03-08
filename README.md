# Text Game

A portable, text-based adventure with a director layer that nudges the story toward a defined end goal while letting the player attempt anything.

The project uses the OpenAI Node SDK through a provider-neutral config layer, so you can keep the same app code while swapping between providers that support OpenAI-compatible generation and embeddings endpoints.

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
npm run build
npm run dev
npm start
npm test
```

What each command does:

- `npm run type-check` validates all TypeScript source in `src/` and `public/`
- `npm run build` compiles the server to `dist/` and rebuilds the browser asset at `public/app.js`
- `npm run dev` rebuilds the browser asset once, then starts the TypeScript server directly through `tsx`
- `npm start` runs the compiled server from `dist/server.js`
- `npm test` runs type-checking first, then executes the TypeScript tests directly

Current limitation of the browser asset path:

- `npm run dev` rebuilds `public/app.js` when it starts, but it does not yet watch `public/app.ts` continuously during the same session

## Docker And Launcher Runtime

Use Docker and the Windows launcher to exercise the compiled runtime path that later packaging work will depend on.

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
- the Docker image builds the browser asset and compiled server output up front, then runs `dist/server.js`
- the app source is baked into the image so startup works even when Docker bind mounts from a Windows secondary drive are flaky
- the SQLite database lives in a Docker volume so app state can survive container restarts without hiding the built-in spec files

Current limitation of the Docker runtime path:

- source edits require a rebuild because the app is not bind-mounted into the container

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

1. Copy `.env.example` to `.env` and choose either hosted API credentials or the local AI settings you want.
2. For local development, run:

```bash
npm install
npm run type-check
npm run dev
```

3. Open `http://localhost:3000`.

For the compiled runtime smoke path, use:

```bash
docker compose up --build
```

Useful Docker commands:

```bash
docker compose up --build
docker compose up -d
docker compose logs -f app
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

Or, if `npm` is already installed and on `PATH`:

```bash
npm run dev:windows
```

The launcher:

- checks Docker and Compose
- reads `.env` when present
- falls back to the local Ollama preset for that run when `.env` is missing
- checks the configured AI path and starts local Ollama when possible
- clears any previous `text-game` compose app container before starting the fresh app instance
- automatically picks a free local port for that run if the configured port is already occupied by another service
- starts the app container through `docker compose`
- waits for the app container to become healthy, confirms the player surface is actually being served, then opens the browser automatically
- stops early with a plain error when a configured local AI URL is unreachable

Useful flags:

- `-NoBrowser` skips opening the webpage
- `-Rebuild` forces a Docker image rebuild before launch

The launcher respects `PORT` from your PowerShell session or `.env`. If that port is already taken by another local service, the launcher now falls back to a nearby free port for that run and prints the chosen URL before opening the browser.

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

### Docker note for Windows repo drives

If Docker Desktop cannot mount the drive that contains this repo, the container now falls back to the copy baked into the image.

- startup still works through `docker compose up --build` or `scripts/start-dev.ps1`
- live source edits are not reflected until you rebuild
- this fallback is meant to keep launch reliable while later tasks improve the packaged path

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
- `POST /api/turn` returns the narrator payload plus safe debug details such as request id, latency, prompt preview, embedding fallback status, validation result, and before/after player state
- API keys are not returned by the debug payload; only non-secret runtime metadata is exposed

## Startup Recovery

First-turn setup problems now split into two paths:

- the Windows launcher stops before opening the app when a configured local LiteLLM or Ollama URL is unreachable
- the browser shows a setup panel when config is incomplete or the server can prove the configured model names do not exist on the AI service

Common fixes:

- add `AI_API_KEY` or `OPENAI_API_KEY` when `AI_PROVIDER=openai-compatible`
- use a full AI base URL such as `https://api.openai.com/v1`, `http://127.0.0.1:4000`, or `http://127.0.0.1:11434/v1`
- when the app runs in Docker against a host-local AI service, use `host.docker.internal` instead of `localhost`
- if LiteLLM or Ollama reports different model names than the ones in `.env`, update the configured chat and embedding model vars to match
