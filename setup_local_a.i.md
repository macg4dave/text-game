# Windows Local AI Setup

This is the recommended local smoke-test path for this repo as of 2026-03-07.

It uses Ollama on Windows because Ollama officially supports:

- native Windows installs
- an OpenAI-compatible API on `http://localhost:11434/v1`
- structured outputs through `response_format`
- local embeddings for retrieval

## Recommended Model Pair

- chat: `gemma3:4b`
- embeddings: `embeddinggemma`

This keeps the download small enough for dev use while still giving the game loop a better chance of returning valid JSON than the tiniest models.

If your machine is tight on RAM or download space, you can try `gemma3:1b` instead. Expect lower structured-output reliability.

## Install Ollama On Windows

1. Install Ollama from the official Windows docs:
   - https://docs.ollama.com/windows
2. After install, confirm the CLI is available:

```powershell
ollama --version
```

The Windows app normally keeps the local API running in the background on `http://localhost:11434`.

## Download The Models

Run these in PowerShell:

```powershell
ollama pull gemma3:4b
ollama pull embeddinggemma
```

Optional smaller chat model:

```powershell
ollama pull gemma3:1b
```

## Repo Configuration

Set your `.env` file like this:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
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

## Start The App

```powershell
docker compose up --build
```

Then open `http://localhost:3000`.

On Windows, you can use the launcher instead:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

## Default Test Workflow

Use this harness whenever you change prompts, schemas, model defaults, or adapter request shapes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1
```

What it checks:

- embeddings endpoint responds
- structured JSON schema output responds
- the repo's `game_turn`-shaped contract still parses

Recommended loop:

1. Run the harness before you edit AI workflow code.
2. Make one small change.
3. Re-run the harness.
4. If it fails, fix the contract break before touching unrelated code.

## Smoke Test Checklist

1. Open the app and start a new player.
2. Submit a simple turn such as `look around`.
3. Confirm you get:
   - a narrator response
   - player options
   - no server crash during embedding lookup

## Known Limits

- This path is for local smoke tests, not quality or balance validation.
- Small local models may drift from the JSON schema more often than the default hosted path.
- Turn quality, pacing, and quest progression will likely be worse than the default LiteLLM or hosted OpenAI-compatible setup.

## Official References

- Windows install: https://docs.ollama.com/windows
- OpenAI compatibility: https://docs.ollama.com/openai
- Structured outputs: https://docs.ollama.com/capabilities/structured-outputs
- Embeddings: https://docs.ollama.com/capabilities/embeddings
- Gemma 3 model library: https://ollama.com/library/gemma3
