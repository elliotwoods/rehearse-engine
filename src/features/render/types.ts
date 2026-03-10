export type RenderCaptureStrategy = "pipe" | "temp-folder";

export type RenderStartTimeMode = "current" | "zero";
export type RenderResolutionPreset = "custom" | "fhd" | "4k" | "8k" | "8k2k";
export type RenderSupersampleScale = 1 | 2 | 4;
export type RenderProgressPhase = "prepare" | "pre-run" | "render" | "write" | "drain";

export interface RenderCameraPathOption {
  id: string;
  label: string;
  durationSeconds: number;
}

export interface RenderSettings {
  resolutionPreset: RenderResolutionPreset;
  width: number;
  height: number;
  supersampleScale: RenderSupersampleScale;
  fps: number;
  bitrateMbps: number;
  durationSeconds: number;
  preRunSeconds: number;
  showDebugViews: boolean;
  startTimeMode: RenderStartTimeMode;
  cameraPathId: string;
  strategy: RenderCaptureStrategy;
}

export interface RenderProgress {
  phase: RenderProgressPhase;
  phaseIndex: number;
  phaseCount: number;
  renderFrameCountTotal: number;
  renderedFrameCount: number;
  writtenFrameCount: number;
  queuedBytes: number;
  queueBudgetBytes: number;
  overallUnitsCompleted: number;
  overallUnitsTotal: number;
  message: string;
}
