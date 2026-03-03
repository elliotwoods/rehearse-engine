export function computeFrameCount(durationSeconds: number, fps: number): number {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0.01, durationSeconds) : 10;
  const safeFps = Number.isFinite(fps) ? Math.max(1, Math.floor(fps)) : 24;
  return Math.max(1, Math.floor(safeDuration * safeFps));
}

export function frameSimTime(startTimeSeconds: number, frameIndex: number, fps: number): number {
  return startTimeSeconds + frameIndex / Math.max(1, fps);
}

export function frameProgress(frameIndex: number, frameCount: number): number {
  if (frameCount <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(1, frameIndex / (frameCount - 1)));
}

