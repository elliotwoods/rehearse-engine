import type { RenderCaptureStrategy, RenderSettings } from "@/features/render/types";

export interface RenderExporterResult {
  summary: string;
}

export interface RenderExporter {
  writeFrame(framePngBytes: Uint8Array, frameIndex: number): Promise<void>;
  finalize(): Promise<RenderExporterResult>;
  abort(): Promise<void>;
}

function padFrame(frameIndex: number): string {
  return String(frameIndex).padStart(6, "0");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function buildScript(encoder: string, fps: number, bitrateMbps: number, outputName: string): { sh: string; bat: string } {
  const ffmpegCommand = `ffmpeg -y -framerate ${String(fps)} -i frame_%06d.png -an -c:v ${encoder} -b:v ${String(bitrateMbps)}M -pix_fmt yuv420p "${outputName}"`;
  return {
    sh: `#!/usr/bin/env bash\nset -euo pipefail\n${ffmpegCommand}\n`,
    bat: `@echo off\r\n${ffmpegCommand}\r\n`
  };
}

async function createElectronPipeExporter(settings: RenderSettings): Promise<RenderExporter> {
  if (!window.electronAPI) {
    throw new Error("Pipe render is only available in Electron.");
  }
  const outputPath = await window.electronAPI.openSaveDialog({
    title: "Save rendered video",
    defaultFileName: "render.mp4",
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }]
  });
  if (!outputPath) {
    throw new Error("Render cancelled.");
  }
  const open = await window.electronAPI.renderPipeOpen({
    outputPath,
    fps: settings.fps,
    bitrateMbps: settings.bitrateMbps
  });
  let closed = false;
  return {
    writeFrame: async (framePngBytes) => {
      if (closed) {
        throw new Error("Render pipe is closed.");
      }
      await window.electronAPI!.renderPipeWriteFrame({
        pipeId: open.pipeId,
        framePngBytes
      });
    },
    finalize: async () => {
      if (closed) {
        return { summary: `Saved ${outputPath}` };
      }
      closed = true;
      const done = await window.electronAPI!.renderPipeClose({ pipeId: open.pipeId });
      return { summary: done.summary };
    },
    abort: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await window.electronAPI!.renderPipeAbort({ pipeId: open.pipeId });
    }
  };
}

async function createElectronTempExporter(settings: RenderSettings): Promise<RenderExporter> {
  if (!window.electronAPI) {
    throw new Error("Temp-folder export is unavailable.");
  }
  const folderPath = await window.electronAPI.openDirectoryDialog({
    title: "Choose output folder for render frames"
  });
  if (!folderPath) {
    throw new Error("Render cancelled.");
  }
  const init = await window.electronAPI.renderTempInit({
    folderPath,
    fps: settings.fps,
    bitrateMbps: settings.bitrateMbps,
    outputFileName: "render.mp4"
  });
  let closed = false;
  return {
    writeFrame: async (framePngBytes, frameIndex) => {
      if (closed) {
        throw new Error("Render temp job is closed.");
      }
      await window.electronAPI!.renderTempWriteFrame({
        jobId: init.jobId,
        frameIndex,
        framePngBytes
      });
    },
    finalize: async () => {
      if (closed) {
        return { summary: `Saved ${init.outputPath}` };
      }
      closed = true;
      const done = await window.electronAPI!.renderTempFinalize({ jobId: init.jobId });
      return { summary: done.summary };
    },
    abort: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await window.electronAPI!.renderTempAbort({ jobId: init.jobId });
    }
  };
}

async function createWebTempExporter(settings: RenderSettings): Promise<RenderExporter> {
  const picker = (window as Window & { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker;
  if (!picker) {
    throw new Error("This browser does not support direct folder writing for temp renders.");
  }
  const rootDir = await picker();
  const folderName = `simularca-render-${Date.now()}`;
  const renderDir = await rootDir.getDirectoryHandle(folderName, { create: true });
  let closed = false;
  let frameCount = 0;
  return {
    writeFrame: async (framePngBytes, frameIndex) => {
      if (closed) {
        throw new Error("Render job is closed.");
      }
      const file = await renderDir.getFileHandle(`frame_${padFrame(frameIndex)}.png`, { create: true });
      const writable = await file.createWritable();
      await writable.write(framePngBytes);
      await writable.close();
      frameCount += 1;
    },
    finalize: async () => {
      if (!closed) {
        const scripts = buildScript("hevc_nvenc", settings.fps, settings.bitrateMbps, "render.mp4");
        const shHandle = await renderDir.getFileHandle("encode.sh", { create: true });
        const shWrite = await shHandle.createWritable();
        await shWrite.write(scripts.sh);
        await shWrite.close();
        const batHandle = await renderDir.getFileHandle("encode.bat", { create: true });
        const batWrite = await batHandle.createWritable();
        await batWrite.write(scripts.bat);
        await batWrite.close();
        const readmeHandle = await renderDir.getFileHandle("README.txt", { create: true });
        const readmeWrite = await readmeHandle.createWritable();
        await readmeWrite.write(
          "Run encode.bat on Windows or encode.sh on macOS/Linux.\nIf hevc_nvenc is unavailable, replace encoder with libx265."
        );
        await readmeWrite.close();
        closed = true;
      }
      return { summary: `Wrote ${String(frameCount)} frames and encode scripts.` };
    },
    abort: async () => {
      closed = true;
    }
  };
}

export async function createRenderExporter(settings: RenderSettings): Promise<RenderExporter> {
  if (settings.strategy === "pipe") {
    return await createElectronPipeExporter(settings);
  }
  if (window.electronAPI) {
    return await createElectronTempExporter(settings);
  }
  return await createWebTempExporter(settings);
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("Failed to capture frame from canvas."));
        return;
      }
      resolve(value);
    }, "image/png");
  });
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export function pngBytesToDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

export function strategyLabel(strategy: RenderCaptureStrategy): string {
  return strategy === "pipe" ? "Pipe" : "Temp folder";
}

