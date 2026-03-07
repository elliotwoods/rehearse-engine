import type { SceneFramePacingSettings } from "@/core/types";

const MAX_FRAME_DELTA_MS = 1000;

export function normalizeFramePacing(settings: SceneFramePacingSettings): SceneFramePacingSettings {
  return {
    mode: settings.mode === "fixed" ? "fixed" : "vsync",
    targetFps: Math.max(1, Math.round(settings.targetFps))
  };
}

export function formatFramePacingLabel(settings: SceneFramePacingSettings): string {
  return settings.mode === "vsync" ? "VSync" : `${Math.max(1, Math.round(settings.targetFps))} FPS`;
}

export class FramePacer {
  private settings: SceneFramePacingSettings;
  private lastTickAtMs: number | null = null;
  private accumulatedMs = 0;

  public constructor(settings: SceneFramePacingSettings) {
    this.settings = normalizeFramePacing(settings);
  }

  public setSettings(settings: SceneFramePacingSettings): void {
    this.settings = normalizeFramePacing(settings);
    this.lastTickAtMs = null;
    this.accumulatedMs = 0;
  }

  public shouldRender(nowMs: number): boolean {
    if (this.settings.mode === "vsync") {
      this.lastTickAtMs = nowMs;
      this.accumulatedMs = 0;
      return true;
    }

    const frameIntervalMs = 1000 / this.settings.targetFps;
    if (this.lastTickAtMs === null) {
      this.lastTickAtMs = nowMs;
      this.accumulatedMs = frameIntervalMs;
    } else {
      const deltaMs = Math.max(0, Math.min(MAX_FRAME_DELTA_MS, nowMs - this.lastTickAtMs));
      this.lastTickAtMs = nowMs;
      this.accumulatedMs = Math.min(this.accumulatedMs + deltaMs, frameIntervalMs * 4);
    }

    if (this.accumulatedMs + 0.1 < frameIntervalMs) {
      return false;
    }

    this.accumulatedMs = Math.max(0, this.accumulatedMs - frameIntervalMs);
    return true;
  }
}
