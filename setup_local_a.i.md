# Windows Local AI Setup

The default app-facing setup for this repo is still LiteLLM.

Use this guide when you want an optional larger local model on Windows without changing the app-facing contract. The preferred shape is now:

- the app stays on `AI_PROVIDER=litellm`
- the default Docker stack now starts the app plus LiteLLM plus a repo-managed `ollama` service and routes the stable aliases there by default
- an optional Docker override adds a local Ollama backend
- LiteLLM keeps the stable aliases `game-chat` and `game-embedding`
- LiteLLM routes `game-chat` to the local model only when you intentionally opt into that path
- helper tasks and embeddings stay on fast hosted routes unless you are explicitly testing a different setup

If you only want the thinnest local smoke-test loop and do not want the Docker override, a direct `AI_PROVIDER=ollama` fallback is still documented below.

This guide uses Ollama because it has an official Docker image, works well with LiteLLM routing, and supports local NVIDIA GPU acceleration when Docker is configured for GPU passthrough.

## GPU Tier Matrix

The authoritative local-GPU matrix for this repo lives in [scripts/local-gpu-profile-matrix.json](/g:/text-game/scripts/local-gpu-profile-matrix.json).

Current first-pass profiles:

- `local-gpu-8gb` (`verified`): `gemma3:4b` for chat, hosted `text-embedding-3-small` for `game-embedding`
- `local-gpu-12gb` (`heuristic`): `gemma3:12b` for chat, hosted `text-embedding-3-small` for `game-embedding`
- `local-gpu-20gb-plus` (`heuristic`): `gemma3:27b` for chat, local `embeddinggemma` may back `game-embedding`

Use VRAM as the selection key. GPU SKU names are documentation-only examples.

Artifact-size references for these recommendations come from the official Ollama library pages for [gemma3:4b](https://ollama.com/library/gemma3:4b), [gemma3:12b](https://ollama.com/library/gemma3:12b), [gemma3:27b](https://ollama.com/library/gemma3:27b), and [embeddinggemma](https://ollama.com/library/embeddinggemma). Treat those artifact sizes as lower than the real VRAM headroom you need for stable local inference.

If your machine is tight on VRAM or download space, `gemma3:1b` remains a smoke-test-only fallback for the `local-gpu-8gb` route. Expect lower structured-output reliability.

## Recommended Docker GPU Path

This is the first-class developer override path for Windows:

1. Install Docker Desktop and keep it on the Linux container backend.
2. Make sure WSL2 is enabled for Docker Desktop.
3. Install NVIDIA drivers on the host and confirm `nvidia-smi` works in PowerShell.
4. Copy `.env.example` to `.env` if you have not already.
5. Pull the default models into the repo-managed Docker `ollama` service:

```powershell
docker compose exec ollama ollama pull gemma3:4b
docker compose exec ollama ollama pull embeddinggemma
```
6. Start the stack with the GPU override:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -AiStack local-gpu
```

Raw Docker equivalent:

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

What this does:

- starts the normal app container
- starts the LiteLLM sidecar
- switches LiteLLM to `litellm.local-gpu.config.yaml`
- starts an Ollama container with NVIDIA GPU reservation
- keeps the app-facing aliases as `game-chat` and `game-embedding`

Notes:

- GPU passthrough in this repo is officially targeted at **NVIDIA on Windows via Docker Desktop + WSL2** first.
- The GPU reservation is attached only to the `ollama` container, not the app or LiteLLM containers.
- `litellm.local-gpu.config.yaml` now tracks `local-gpu-8gb` as the active default profile.
- `game-embedding` stays hosted by default in the active `local-gpu-8gb` path, so keep `OPENAI_API_KEY` populated unless you intentionally switch to the `local-gpu-20gb-plus` manual swap guidance.
- the plain `docker compose up --build` path now uses the repo-managed Docker `ollama` service for both stable aliases through `litellm.config.yaml`

## Install Ollama On Windows

1. Install Ollama from the official Windows docs:
   - <https://docs.ollama.com/windows>
2. After install, confirm the CLI is available:

```powershell
ollama --version
```

The Windows app normally keeps the local API running in the background on `http://localhost:11434`.

## Download The Models

Run these in PowerShell for the active `local-gpu-8gb` default:

```powershell
ollama pull gemma3:4b
ollama pull embeddinggemma
```

Optional smaller chat model:

```powershell
ollama pull gemma3:1b
```

Additional model pulls for documented higher tiers:

- `local-gpu-12gb`: `ollama pull gemma3:12b`
- `local-gpu-20gb-plus`: `ollama pull gemma3:27b` and `ollama pull embeddinggemma`

## Gateway-Aligned Repo Configuration

Keep the app on LiteLLM in `.env`:

```env
AI_PROVIDER=litellm
LITELLM_PROXY_URL=http://127.0.0.1:4000
LITELLM_API_KEY=anything
LITELLM_CHAT_MODEL=game-chat
LITELLM_EMBEDDING_MODEL=game-embedding
PORT=3000
```

If you use the default Docker stack from this repo, you do not need to change the app-facing LiteLLM URL for containers manually; the Compose runtime now points the app container at the internal LiteLLM sidecar automatically.

Then choose one of these LiteLLM configs:

- `litellm.config.yaml` for the default Docker Ollama smoke path
- `litellm.local-gpu.config.yaml` for the Docker-backed Ollama GPU override

The included `litellm.local-gpu.config.yaml` keeps `local-gpu-8gb` active and includes commented manual swap references for `local-gpu-12gb` and `local-gpu-20gb-plus`. T02g does not add runtime profile-selection env vars yet.

If you build your own equivalent config, keep these rules:

- keep `model_name: game-chat`
- keep `model_name: game-embedding`
- leave `game-embedding` on a small hosted embedding model unless you are explicitly validating a local embedding path
- repoint only the upstream target behind `game-chat` to the provider string supported by your LiteLLM install for the local model you want to test

That way the app, launcher, and future setup UI keep talking about one stable contract even when the upstream model changes.

## Direct Ollama Fallback Configuration

If you do not want to run LiteLLM for a quick smoke test, set your `.env` file like this:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434/v1
OLLAMA_API_KEY=ollama
OLLAMA_CHAT_MODEL=gemma3:4b
OLLAMA_EMBEDDING_MODEL=embeddinggemma
PORT=3000
```

Notes:

- `OLLAMA_API_KEY` is required by the OpenAI SDK shape but ignored by Ollama.
- If you switch to `gemma3:1b`, change only `OLLAMA_CHAT_MODEL`.
- If you use a non-default Ollama host, update `OLLAMA_BASE_URL`.
- `host.docker.internal` is the right default when the app runs in Docker and Ollama runs on the host machine.
- This direct path is for smoke tests and local experimentation; the repo's default setup story stays LiteLLM-first.

## Start The App

Recommended gateway-first flow:

1. Keep the app on the LiteLLM `.env` values shown above.
2. Use the default Docker stack for the repo-managed Docker Ollama route.
3. Use the GPU override only when you intentionally want the local model path.

For normal local development after installing Node.js, use the direct TypeScript workflow:

```powershell
npm install
npm run type-check
npm run dev
```

That path runs the server from TypeScript source and rebuilds the browser asset before startup.

For the default Docker-Ollama path:

```powershell
docker compose up --build
```

For the optional local GPU override path:

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Then open `http://localhost:3000`.

On Windows, you can use the launcher instead:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

Or the launcher with the local GPU override:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -AiStack local-gpu
```

What the current startup checks will tell you on the local GPU path:

- if LiteLLM is up but Ollama cannot be reached, startup now reports that the local model service is unavailable instead of a generic AI failure
- if the selected Ollama model is missing, startup now reports that the local model must be pulled or that you should switch back to the hosted default path
- if the launcher cannot find `nvidia-smi`, it now warns that the local path may fail or fall back to very slow CPU inference
- if you manually swap to a larger heuristic profile and it proves unreliable, step back one tier instead of trying to force the biggest model to fit

If you are using the direct `AI_PROVIDER=ollama` fallback instead of LiteLLM, the same app startup commands still work.

## Default Test Workflow

Use this harness whenever you change prompts, schemas, model defaults, or adapter request shapes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1
```

What it checks:

- embeddings endpoint responds
- structured JSON schema output responds
- the repo's `game_turn`-shaped contract still parses

Script-maintenance note:

- keep shared PowerShell behavior in `scripts/lib/shared.ps1`
- keep `scripts/test-local-ai-workflow.ps1` focused on AI-contract checks and reporting rather than duplicating launcher helper logic

Recommended loop:

1. Run `npm run type-check` and the harness before you edit AI workflow code.
2. Make one small change.
3. Re-run `npm run type-check`.
4. Re-run the harness.
5. If it fails, fix the contract break before touching unrelated code.

When you change the GPU tier matrix or the active local-GPU config, run this first:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/validate-local-gpu-profile-matrix.ps1
```

## Smoke Test Checklist

1. Open the app and start a new player.
2. Submit a simple turn such as `look around`.
3. Confirm you get:
   - a narrator response
   - player options
   - no server crash during embedding lookup

## Known Limits

- The gateway-aligned local-model path is optional and is not the default end-user setup.
- The Docker GPU override currently treats NVIDIA on Windows via Docker Desktop and WSL2 as the first officially supported GPU path.
- This path is for local smoke tests, not quality or balance validation.
- Small local models may drift from the JSON schema more often than the default hosted path.
- Turn quality, pacing, and quest progression will likely be worse than the default LiteLLM or hosted OpenAI-compatible setup.
- Only the `local-gpu-8gb` profile is treated as sanity-check-ready in this task. The `12 GB` and `20 GB+` tiers remain heuristic until they are tested on matching hardware.

## Official References

- Windows install: <https://docs.ollama.com/windows>
- OpenAI compatibility: <https://docs.ollama.com/openai>
- Structured outputs: <https://docs.ollama.com/capabilities/structured-outputs>
- Embeddings: <https://docs.ollama.com/capabilities/embeddings>
- Gemma 3 model library: <https://ollama.com/library/gemma3>
