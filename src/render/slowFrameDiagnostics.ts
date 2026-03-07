import type { AppKernel } from "@/app/kernel";
import type { RenderEngine } from "@/core/types";

const SLOW_FRAME_LOG_INTERVAL_MS = 1000;

interface SlowFrameSample {
  backend: RenderEngine;
  totalMs: number;
  sceneSyncMs: number;
  sparkSyncMs: number;
  controlsMs: number;
  renderMs: number;
}

const lastLoggedAtByBackend = new Map<RenderEngine, number>();

export function reportSlowFrame(kernel: AppKernel, sample: SlowFrameSample): void {
  const runtimeDebug = kernel.store.getState().state.runtimeDebug;
  if (!runtimeDebug.slowFrameDiagnosticsEnabled) {
    return;
  }
  if (sample.totalMs < runtimeDebug.slowFrameDiagnosticsThresholdMs) {
    return;
  }

  const now = performance.now();
  const lastLoggedAt = lastLoggedAtByBackend.get(sample.backend) ?? Number.NEGATIVE_INFINITY;
  if (now - lastLoggedAt < SLOW_FRAME_LOG_INTERVAL_MS) {
    return;
  }
  lastLoggedAtByBackend.set(sample.backend, now);

  kernel.store.getState().actions.addLog({
    level: "warn",
    message: `Slow ${sample.backend.toUpperCase()} frame: ${sample.totalMs.toFixed(0)} ms`,
    details: [
      `sceneSync: ${sample.sceneSyncMs.toFixed(0)} ms`,
      `sparkSync: ${sample.sparkSyncMs.toFixed(0)} ms`,
      `controls: ${sample.controlsMs.toFixed(0)} ms`,
      `render: ${sample.renderMs.toFixed(0)} ms`
    ].join(" | ")
  });
}
