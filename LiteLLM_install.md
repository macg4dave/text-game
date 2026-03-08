# LiteLLM Install Guide

This project uses LiteLLM as the default AI control plane.

The app-facing contract should stay stable:

- `game-chat`
- `game-embedding`

When you want to change upstream providers, change `litellm.config.yaml` or your LiteLLM config instead of changing the app-facing alias names.

## What this guide covers

This guide explains how to:

- install LiteLLM on Windows, macOS, or Linux
- start the LiteLLM proxy with this repo's `litellm.config.yaml`
- point the app at the proxy through `.env`
- verify the proxy is reachable before you start the game app

## Recommended setup shape

For this repo, the recommended baseline is:

- keep the app on `AI_PROVIDER=litellm`
- keep `LITELLM_CHAT_MODEL=game-chat`
- keep `LITELLM_EMBEDDING_MODEL=game-embedding`
- keep embeddings on a fast hosted model by default
- start with hosted routing for small helper tasks and the main turn path
- only move `game-chat` to a larger optional local model when you intentionally want that trade-off

## Prerequisites

You need:

- Python 3.10 or newer
- `pipx` preferred, or `pip` plus a virtual environment
- a provider API key for the upstream model route in `litellm.config.yaml`

For the included template, that means:

- `OPENAI_API_KEY` for the default hosted route

Optional:

- `LITELLM_MASTER_KEY` if you want the LiteLLM proxy itself to require an API key

## Repo configuration recap

The app `.env` should look like this for the default LiteLLM path:

```env
AI_PROVIDER=litellm
LITELLM_PROXY_URL=http://127.0.0.1:4000
LITELLM_API_KEY=anything
LITELLM_CHAT_MODEL=game-chat
LITELLM_EMBEDDING_MODEL=game-embedding
PORT=3000
```

If the app runs in Docker while LiteLLM runs on your host machine, use this instead:

```env
LITELLM_PROXY_URL=http://host.docker.internal:4000
```

If you enable `LITELLM_MASTER_KEY` on the LiteLLM side, set `LITELLM_API_KEY` in `.env` to the same value.

## Windows

### 1. Install Python

Install Python 3.10+ from one of these:

- official installer: <https://www.python.org/downloads/windows/>
- Microsoft Store Python package if you prefer that path

After install, reopen PowerShell and verify:

```powershell
python --version
```

If `python` is not found, try:

```powershell
py --version
```

### 2. Install pipx

Preferred:

```powershell
py -m pip install --user pipx
py -m pipx ensurepath
```

Then close and reopen PowerShell.

Verify:

```powershell
pipx --version
```

### 3. Install LiteLLM

Using `pipx`:

```powershell
pipx install "litellm[proxy]"
```

If you prefer a project-local virtual environment instead:

```powershell
py -m venv .venv-litellm
.\.venv-litellm\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install "litellm[proxy]"
```

Verify:

```powershell
litellm --help
```

### 4. Start LiteLLM for this repo

From the repo root, set the upstream provider key for the included template:

```powershell
$env:OPENAI_API_KEY = "your_provider_key"
```

Optional proxy auth:

```powershell
$env:LITELLM_MASTER_KEY = "anything"
```

Then start LiteLLM:

```powershell
litellm --config .\litellm.config.yaml --port 4000
```

### 5. Verify the proxy

In another PowerShell window:

```powershell
Invoke-WebRequest http://127.0.0.1:4000/models | Select-Object -ExpandProperty StatusCode
```

A `200` response means the proxy is up.

## macOS

### 1. Install Python and pipx on macOS

Recommended with Homebrew:

```bash
brew install python pipx
pipx ensurepath
```

Then restart Terminal and verify:

```bash
python3 --version
pipx --version
```

If you do not use Homebrew, install Python from <https://www.python.org/downloads/macos/> and then install `pipx` with:

```bash
python3 -m pip install --user pipx
python3 -m pipx ensurepath
```

### 2. Install LiteLLM on macOS

Using `pipx`:

```bash
pipx install 'litellm[proxy]'
```

Or with a virtual environment:

```bash
python3 -m venv .venv-litellm
source .venv-litellm/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install 'litellm[proxy]'
```

Verify:

```bash
litellm --help
```

### 3. Start LiteLLM for this repo on macOS

From the repo root:

```bash
export OPENAI_API_KEY="your_provider_key"
```

Optional proxy auth:

```bash
export LITELLM_MASTER_KEY="anything"
```

Then start the proxy:

```bash
litellm --config ./litellm.config.yaml --port 4000
```

### 4. Verify the proxy on macOS

In another Terminal window:

```bash
curl -i http://127.0.0.1:4000/models
```

A `200 OK` response means the proxy is up.

## Linux

### 1. Install Python and pipx on Linux

Use your distro's package manager if available.

Debian or Ubuntu example:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip pipx
pipx ensurepath
```

Fedora example:

```bash
sudo dnf install -y python3 python3-pip pipx
pipx ensurepath
```

Then restart your shell and verify:

```bash
python3 --version
pipx --version
```

If your distro does not package `pipx`, install it with:

```bash
python3 -m pip install --user pipx
python3 -m pipx ensurepath
```

### 2. Install LiteLLM on Linux

Using `pipx`:

```bash
pipx install 'litellm[proxy]'
```

Or with a virtual environment:

```bash
python3 -m venv .venv-litellm
source .venv-litellm/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install 'litellm[proxy]'
```

Verify:

```bash
litellm --help
```

### 3. Start LiteLLM for this repo on Linux

From the repo root:

```bash
export OPENAI_API_KEY="your_provider_key"
```

Optional proxy auth:

```bash
export LITELLM_MASTER_KEY="anything"
```

Then start the proxy:

```bash
litellm --config ./litellm.config.yaml --port 4000
```

### 4. Verify the proxy on Linux

In another shell:

```bash
curl -i http://127.0.0.1:4000/models
```

A `200 OK` response means the proxy is up.

## Starting the app after LiteLLM is running

Once the LiteLLM proxy is up, start the app with one of the repo's normal paths.

### Direct TypeScript dev path

```bash
npm install
npm run type-check
npm run dev
```

### Docker runtime path

```bash
docker compose up --build
```

### Windows launcher

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

## Optional larger local-model path

If you want to use a larger optional local model without changing the app-facing contract:

1. Keep the app on LiteLLM.
2. Keep `game-chat` and `game-embedding` unchanged in `.env`.
3. Run your local model provider, such as Ollama.
4. Repoint only the upstream target behind `game-chat` in `litellm.config.yaml`.
5. Keep `game-embedding` hosted unless you are explicitly testing local embeddings.

For the repo's direct Ollama smoke-test fallback, see `setup_local_a.i.md`.

## Troubleshooting

### `litellm` command not found

- if you used `pipx`, reopen your shell after `pipx ensurepath`
- on Windows, verify `pipx --version`
- if you installed inside a virtual environment, activate that environment first

### The app cannot reach LiteLLM in Docker

If the app runs in Docker and LiteLLM runs on your host machine, use:

```env
LITELLM_PROXY_URL=http://host.docker.internal:4000
```

Do not use `localhost` in that case.

### The app gets unauthorized errors

- if LiteLLM is using `LITELLM_MASTER_KEY`, make sure the app's `LITELLM_API_KEY` matches it
- if LiteLLM is routing to a hosted provider, make sure the upstream provider key such as `OPENAI_API_KEY` is set in the shell where LiteLLM starts

### The model names do not match

Keep the app-facing names stable:

- `game-chat`
- `game-embedding`

If you want a different upstream provider or model, change the LiteLLM config mapping instead of the app-facing alias names.

## Related repo files

- `litellm.config.yaml` - LiteLLM proxy template for this repo
- `.env.example` - app-facing LiteLLM environment template
- `README.md` - main setup and startup guide
- `setup_local_a.i.md` - optional Windows local-model path
