import { app, BrowserWindow, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import type { DefaultSessionPointer, HdriTranscodeOptions, SessionAssetRef } from "../src/types/ipc";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const IS_DEV = Boolean(DEV_SERVER_URL);
const DEFAULTS_FILE_NAME = "defaults.json";
const SESSION_FILE_NAME = "session.json";
const RUNTIME_LOG_FILE_NAME = "electron-runtime.log";

function getRepoRoot(): string {
  return process.cwd();
}

function getLogsRoot(): string {
  return path.join(getRepoRoot(), "logs");
}

function getRuntimeLogFilePath(): string {
  return path.join(getLogsRoot(), RUNTIME_LOG_FILE_NAME);
}

function toErrorPayload(input: unknown): Record<string, unknown> {
  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack
    };
  }
  if (typeof input === "object" && input !== null) {
    return input as Record<string, unknown>;
  }
  return {
    value: String(input)
  };
}

function writeRuntimeLog(scope: string, message: string, metadata?: unknown): void {
  const timestamp = new Date().toISOString();
  const serialized = metadata === undefined ? "" : ` ${JSON.stringify(toErrorPayload(metadata))}`;
  const line = `[${timestamp}] [${scope}] ${message}${serialized}`;
  console.log(line);
  try {
    fsSync.mkdirSync(getLogsRoot(), { recursive: true });
    fsSync.appendFileSync(getRuntimeLogFilePath(), `${line}\n`, "utf8");
  } catch (error) {
    console.error("Failed to write runtime log", error);
  }
}

void writeRuntimeLog("boot", "electron main module loaded", {
  cwd: process.cwd(),
  node: process.version,
  platform: process.platform
});

function getSaveDataRoot(): string {
  return path.join(getRepoRoot(), "savedata");
}

function getSessionDirectory(sessionName: string): string {
  return path.join(getSaveDataRoot(), sessionName);
}

function getSessionFile(sessionName: string): string {
  return path.join(getSessionDirectory(sessionName), SESSION_FILE_NAME);
}

function getAssetDirectory(sessionName: string, kind: SessionAssetRef["kind"]): string {
  return path.join(getSessionDirectory(sessionName), "assets", kind);
}

async function ensureSessionDirectory(sessionName: string): Promise<void> {
  await fs.mkdir(getSessionDirectory(sessionName), { recursive: true });
  await fs.mkdir(path.join(getSessionDirectory(sessionName), "assets"), { recursive: true });
}

async function ensureDefaultsFile(): Promise<void> {
  const defaultsPath = path.join(getSaveDataRoot(), DEFAULTS_FILE_NAME);
  try {
    await fs.access(defaultsPath);
  } catch {
    const defaults: DefaultSessionPointer = { defaultSessionName: "demo" };
    await fs.mkdir(getSaveDataRoot(), { recursive: true });
    await fs.writeFile(defaultsPath, JSON.stringify(defaults, null, 2), "utf8");
  }
}

async function runToktx({
  inputPath,
  outputPath,
  options
}: {
  inputPath: string;
  outputPath: string;
  options?: HdriTranscodeOptions;
}): Promise<void> {
  const args = [
    "--t2",
    "--encode",
    options?.uastc === false ? "etc1s" : "uastc",
    "--zcmp",
    String(options?.zstdLevel ?? 18)
  ];

  if (options?.generateMipmaps ?? true) {
    args.push("--genmipmap");
  }

  args.push(outputPath, inputPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn("toktx", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderrBuffer = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(new Error(`Unable to run toktx: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `toktx failed with code ${String(code)}. Ensure KTX-Software is installed and toktx is on PATH. ${stderrBuffer}`.trim()
        )
      );
    });
  });
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1680,
    height: 960,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: "#0a0f17",
    webPreferences: {
      preload: path.join(getRepoRoot(), "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  void writeRuntimeLog("window", "Creating BrowserWindow", {
    isDev: IS_DEV,
    devServerUrl: DEV_SERVER_URL ?? null
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame, frameProcessId, frameRoutingId) => {
      void writeRuntimeLog("webcontents", "did-fail-load", {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
        frameProcessId,
        frameRoutingId
      });
    }
  );

  mainWindow.webContents.on("did-finish-load", () => {
    void writeRuntimeLog("webcontents", "did-finish-load", {
      url: mainWindow.webContents.getURL()
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    void writeRuntimeLog("webcontents", "render-process-gone", details);
  });

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    void writeRuntimeLog("webcontents", "preload-error", {
      preloadPath,
      error: toErrorPayload(error)
    });
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level <= 1) {
      return;
    }
    void writeRuntimeLog("renderer-console", "console-message", {
      level,
      message,
      line,
      sourceId
    });
  });

  mainWindow.on("unresponsive", () => {
    void writeRuntimeLog("window", "BrowserWindow became unresponsive");
  });

  mainWindow.on("closed", () => {
    void writeRuntimeLog("window", "BrowserWindow closed");
  });

  if (IS_DEV && DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL).catch((error) => {
      void writeRuntimeLog("window", "Failed to load DEV server URL", error);
    });
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html")).catch((error) => {
      void writeRuntimeLog("window", "Failed to load production index.html", error);
    });
  }

  return mainWindow;
}

function registerIpcHandlers(): void {
  ipcMain.on("renderer:runtime-error", (_event, payload: unknown) => {
    void writeRuntimeLog("renderer", "runtime-error", payload);
  });

  ipcMain.handle("mode:get", () => "electron-rw");

  ipcMain.handle("sessions:list", async () => {
    await fs.mkdir(getSaveDataRoot(), { recursive: true });
    const entries = await fs.readdir(getSaveDataRoot(), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  });

  ipcMain.handle("defaults:load", async () => {
    await ensureDefaultsFile();
    const raw = await fs.readFile(path.join(getSaveDataRoot(), DEFAULTS_FILE_NAME), "utf8");
    return JSON.parse(raw) as DefaultSessionPointer;
  });

  ipcMain.handle("defaults:save", async (_event, pointer: DefaultSessionPointer) => {
    await fs.mkdir(getSaveDataRoot(), { recursive: true });
    await fs.writeFile(path.join(getSaveDataRoot(), DEFAULTS_FILE_NAME), JSON.stringify(pointer, null, 2), "utf8");
  });

  ipcMain.handle("session:load", async (_event, sessionName: string) => {
    await ensureSessionDirectory(sessionName);
    const sessionFile = getSessionFile(sessionName);
    try {
      await fs.access(sessionFile);
    } catch {
      await fs.writeFile(sessionFile, "{}", "utf8");
    }
    return fs.readFile(sessionFile, "utf8");
  });

  ipcMain.handle("session:save", async (_event, sessionName: string, payload: string) => {
    await ensureSessionDirectory(sessionName);
    await fs.writeFile(getSessionFile(sessionName), payload, "utf8");
  });

  ipcMain.handle(
    "asset:import",
    async (
      _event,
      args: {
        sessionName: string;
        sourcePath: string;
        kind: SessionAssetRef["kind"];
      }
    ) => {
      await ensureSessionDirectory(args.sessionName);
      const sourceFileName = path.basename(args.sourcePath);
      const extension = path.extname(sourceFileName);
      const targetName = `${Date.now()}-${randomUUID()}${extension}`;
      const assetDirectory = getAssetDirectory(args.sessionName, args.kind);
      await fs.mkdir(assetDirectory, { recursive: true });
      const targetPath = path.join(assetDirectory, targetName);
      await fs.copyFile(args.sourcePath, targetPath);
      const stat = await fs.stat(targetPath);
      const relativePath = path.relative(getSessionDirectory(args.sessionName), targetPath).replaceAll("\\", "/");

      const assetRef: SessionAssetRef = {
        id: randomUUID(),
        kind: args.kind,
        relativePath,
        sourceFileName,
        byteSize: stat.size
      };
      return assetRef;
    }
  );

  ipcMain.handle(
    "asset:transcode-hdri",
    async (
      _event,
      args: {
        sessionName: string;
        sourcePath: string;
        options?: HdriTranscodeOptions;
      }
    ) => {
      await ensureSessionDirectory(args.sessionName);
      const assetDirectory = getAssetDirectory(args.sessionName, "hdri");
      await fs.mkdir(assetDirectory, { recursive: true });
      const targetName = `${Date.now()}-${randomUUID()}.ktx2`;
      const targetPath = path.join(assetDirectory, targetName);
      await runToktx({
        inputPath: args.sourcePath,
        outputPath: targetPath,
        options: args.options
      });
      const stat = await fs.stat(targetPath);
      const relativePath = path.relative(getSessionDirectory(args.sessionName), targetPath).replaceAll("\\", "/");
      const sourceFileName = path.basename(args.sourcePath);
      const assetRef: SessionAssetRef = {
        id: randomUUID(),
        kind: "hdri",
        relativePath,
        sourceFileName,
        byteSize: stat.size
      };
      return assetRef;
    }
  );

  ipcMain.handle(
    "asset:delete",
    async (
      _event,
      args: {
        sessionName: string;
        relativePath: string;
      }
    ) => {
      const absolute = path.resolve(getSessionDirectory(args.sessionName), args.relativePath);
      await fs.rm(absolute, { force: true });
    }
  );

  ipcMain.handle(
    "asset:resolve-path",
    async (
      _event,
      args: {
        sessionName: string;
        relativePath: string;
      }
    ) => {
      const absolute = path.resolve(getSessionDirectory(args.sessionName), args.relativePath);
      return pathToFileURL(absolute).toString();
    }
  );
}

void app.whenReady().then(async () => {
  process.on("uncaughtException", (error) => {
    void writeRuntimeLog("process", "uncaughtException", error);
  });
  process.on("unhandledRejection", (reason) => {
    void writeRuntimeLog("process", "unhandledRejection", reason);
  });

  app.on("render-process-gone", (_event, webContents, details) => {
    void writeRuntimeLog("app", "render-process-gone", {
      url: webContents.getURL(),
      details
    });
  });
  app.on("child-process-gone", (_event, details) => {
    void writeRuntimeLog("app", "child-process-gone", details);
  });

  void writeRuntimeLog("app", "App starting", {
    isDev: IS_DEV,
    devServerUrl: DEV_SERVER_URL ?? null
  });
  await ensureDefaultsFile();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  void writeRuntimeLog("app", "All windows closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});
