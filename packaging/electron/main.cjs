const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const process = require("node:process");
const { app, BrowserWindow, dialog } = require("electron");

const WINDOW_TITLE = "Text Game Prototype";
const DEFAULT_PORT = 3000;
const READY_TIMEOUT_MS = 60000;
const READY_POLL_MS = 500;
const DOCKER_PROBE_TIMEOUT_MS = 10000;
const GPU_PROBE_TIMEOUT_MS = 10000;

let serverProcess = null;
let logFilePath = "";

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopServer();
});

app.whenReady().then(async () => {
  try {
    const bootstrap = await prepareRuntime();
    await startServer(bootstrap);
    await waitForServer(bootstrap.readyUrl, READY_TIMEOUT_MS);
    await createWindow(bootstrap.appUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLog(`Startup failed: ${message}`);
    dialog.showErrorBox(WINDOW_TITLE, formatStartupFailureMessage(message));
    app.quit();
  }
});

async function createWindow(appUrl) {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    title: WINDOW_TITLE,
    backgroundColor: "#10141a",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await window.loadURL(appUrl);
}

async function prepareRuntime() {
  const appRoot = resolveAppRoot();
  const userDataRoot = app.getPath("userData");
  const runtimeRoot = path.join(userDataRoot, "runtime");
  const logDir = path.join(userDataRoot, "logs");

  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, "data"), { recursive: true });

  logFilePath = path.join(logDir, "desktop-shell.log");
  writeLog(`App root: ${appRoot}`);
  writeLog(`Runtime root: ${runtimeRoot}`);

  syncDirectory(path.join(appRoot, "dist"), path.join(runtimeRoot, "dist"));
  syncDirectory(path.join(appRoot, "public"), path.join(runtimeRoot, "public"));
  syncDirectory(path.join(appRoot, "data", "spec"), path.join(runtimeRoot, "data", "spec"));
  syncFile(path.join(appRoot, "package.json"), path.join(runtimeRoot, "package.json"));
  ensureLinkedDirectory(path.join(appRoot, "node_modules"), path.join(runtimeRoot, "node_modules"));

  const envFile = resolveEnvFile(appRoot);
  const envVars = envFile ? readDotEnvFile(envFile) : {};
  const prerequisiteSnapshot = detectDesktopPrerequisites();
  const preferredPort = parsePort(envVars.PORT || process.env.PORT);
  const port = await findAvailablePort(preferredPort);

  if (envFile) {
    writeLog(`Using environment file: ${envFile}`);
  } else {
    writeLog("No .env file found for desktop shell; using inherited environment variables.");
  }

  return {
    appRoot,
    runtimeRoot,
    envFile,
    envVars,
    prerequisiteSnapshot,
    port,
    appUrl: `http://127.0.0.1:${port}/`,
    readyUrl: `http://127.0.0.1:${port}/api/setup/status`
  };
}

async function startServer({ runtimeRoot, envVars, prerequisiteSnapshot, port }) {
  const serverEntry = path.join(runtimeRoot, "dist", "server", "index.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Desktop prototype could not find ${serverEntry}. Run the build before launching the shell.`);
  }

  const childEnv = {
    ...process.env,
    ...envVars,
    PORT: String(port),
    TEXT_GAME_DESKTOP_SHELL: "1",
    TEXT_GAME_DESKTOP_DOCKER_STATE: prerequisiteSnapshot.dockerState,
    TEXT_GAME_DESKTOP_GPU_STATE: prerequisiteSnapshot.gpuState,
    TEXT_GAME_DESKTOP_PREREQ_NOTES: prerequisiteSnapshot.notes.join(" || "),
    ELECTRON_RUN_AS_NODE: "1"
  };

  writeLog(`Starting local server on port ${port}.`);
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: runtimeRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  serverProcess.stdout?.on("data", (chunk) => {
    writeLog(`[server:out] ${String(chunk).trimEnd()}`);
  });

  serverProcess.stderr?.on("data", (chunk) => {
    writeLog(`[server:err] ${String(chunk).trimEnd()}`);
  });

  serverProcess.on("exit", (code, signal) => {
    writeLog(`Server exited with code=${code ?? "null"} signal=${signal ?? "null"}.`);
    serverProcess = null;
  });
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  writeLog("Stopping local server.");
  serverProcess.kill();
}

async function waitForServer(readyUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "The local server never reported ready.";

  while (Date.now() < deadline) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error("The local server exited before the Electron shell could open the game window.");
    }

    try {
      const response = await fetch(readyUrl);
      const body = await response.text();
      if (response.ok && body.includes("\"setup\"")) {
        writeLog(`Server ready at ${readyUrl}`);
        return;
      }

      lastError = `Unexpected readiness response: HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(READY_POLL_MS);
  }

  throw new Error(`Desktop prototype timed out waiting for the local server. Last error: ${lastError}`);
}

function formatStartupFailureMessage(message) {
  if (
    message.includes("timed out waiting for the local server") ||
    message.includes("exited before the Electron shell could open the game window")
  ) {
    const logHint = logFilePath ? `\n\nDesktop shell log: ${logFilePath}` : "";
    return `${message}\n\nThis is a packaged-shell startup failure, not a LiteLLM readiness problem. If Docker Desktop or LiteLLM were the only blockers, the game window would still open and show the setup recovery panel.${logHint}`;
  }

  return message;
}

function detectDesktopPrerequisites() {
  const dockerProbe = spawnSync("docker", ["info", "--format", "{{json .ServerVersion}}"], {
    windowsHide: true,
    encoding: "utf8",
    timeout: DOCKER_PROBE_TIMEOUT_MS
  });

  const notes = [];
  if (dockerProbe.error) {
    if (dockerProbe.error.code === "ENOENT") {
      notes.push("docker.exe was not found on PATH.");
      return {
        dockerState: "missing",
        gpuState: "tooling-missing",
        notes
      };
    }

    notes.push(`Docker probe failed: ${dockerProbe.error.message}`);
    return {
      dockerState: "not-running",
      gpuState: "tooling-missing",
      notes
    };
  }

  const dockerOutput = `${dockerProbe.stdout || ""}\n${dockerProbe.stderr || ""}`.trim();
  if (dockerProbe.status !== 0) {
    if (dockerOutput) {
      notes.push(dockerOutput);
    }

    return {
      dockerState: "not-running",
      gpuState: "tooling-missing",
      notes
    };
  }

  if (dockerOutput) {
    notes.push(`Docker probe succeeded: ${dockerOutput}`);
  }

  const gpuProbe = spawnSync("nvidia-smi", ["-L"], {
    windowsHide: true,
    encoding: "utf8",
    timeout: GPU_PROBE_TIMEOUT_MS
  });

  if (gpuProbe.error) {
    notes.push(`GPU probe failed: ${gpuProbe.error.message}`);
    return {
      dockerState: "running",
      gpuState: "tooling-missing",
      notes
    };
  }

  if (gpuProbe.status !== 0) {
    const gpuOutput = `${gpuProbe.stdout || ""}\n${gpuProbe.stderr || ""}`.trim();
    if (gpuOutput) {
      notes.push(gpuOutput);
    }

    return {
      dockerState: "running",
      gpuState: "tooling-missing",
      notes
    };
  }

  return {
    dockerState: "running",
    gpuState: "ready",
    notes
  };
}

function resolveAppRoot() {
  if (app.isPackaged) {
    return app.getAppPath();
  }

  return path.resolve(__dirname, "..", "..");
}

function resolveEnvFile(appRoot) {
  const candidates = [
    path.join(path.dirname(process.execPath), ".env"),
    path.join(app.getPath("userData"), ".env"),
    path.join(appRoot, ".env")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function readDotEnvFile(filePath) {
  const result = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    result[key] = stripQuotes(rawValue);
  }

  return result;
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function syncDirectory(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Desktop prototype is missing required runtime content: ${sourceDir}`);
  }

  fs.mkdirSync(path.dirname(destinationDir), { recursive: true });
  fs.cpSync(sourceDir, destinationDir, { recursive: true, force: true });
}

function syncFile(sourceFile, destinationFile) {
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Desktop prototype is missing required runtime content: ${sourceFile}`);
  }

  fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
  fs.copyFileSync(sourceFile, destinationFile);
}

function ensureLinkedDirectory(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Desktop prototype is missing required runtime content: ${sourceDir}`);
  }

  if (fs.existsSync(destinationDir)) {
    return;
  }

  fs.mkdirSync(path.dirname(destinationDir), { recursive: true });
  fs.symlinkSync(sourceDir, destinationDir, process.platform === "win32" ? "junction" : "dir");
}

function parsePort(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_PORT), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_PORT;
  }

  return parsed;
}

async function findAvailablePort(preferredPort) {
  const basePort = parsePort(preferredPort);

  if (await canListen(basePort)) {
    return basePort;
  }

  for (let offset = 1; offset <= 20; offset += 1) {
    const candidate = basePort + offset;
    if (candidate < 65536 && (await canListen(candidate))) {
      writeLog(`Port ${basePort} was busy. Using fallback port ${candidate}.`);
      return candidate;
    }
  }

  throw new Error(`Desktop prototype could not find a free local port near ${basePort}.`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once("error", () => {
      resolve(false);
    });

    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  if (logFilePath) {
    fs.appendFileSync(logFilePath, line, "utf8");
  }
  process.stdout.write(line);
}
