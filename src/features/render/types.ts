export type RenderCaptureStrategy = "pipe" | "temp-folder";

export type RenderStartTimeMode = "current" | "zero";

export interface RenderSettings {
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  durationSeconds: number;
  startTimeMode: RenderStartTimeMode;
  cameraPathActorId: string;
  cameraTargetActorId: string;
  strategy: RenderCaptureStrategy;
}

export interface RenderProgress {
  frameIndex: number;
  frameCount: number;
  message: string;
}

