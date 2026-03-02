import type { AppStoreApi } from "@/core/store/appStore";

export class SimulationClock {
  private accumulator = 0;
  private lastFrameTime = 0;
  private readonly fixedStepSeconds: number;

  public constructor(fixedStepSeconds = 1 / 60) {
    this.fixedStepSeconds = fixedStepSeconds;
  }

  public reset(nowMs: number): void {
    this.lastFrameTime = nowMs;
    this.accumulator = 0;
  }

  public tick(nowMs: number, store: AppStoreApi): void {
    if (this.lastFrameTime === 0) {
      this.reset(nowMs);
      return;
    }

    const frameSeconds = Math.max(0, Math.min(0.25, (nowMs - this.lastFrameTime) / 1000));
    this.lastFrameTime = nowMs;
    const state = store.getState().state;
    if (!state.time.running) {
      return;
    }
    this.accumulator += frameSeconds * state.time.speed;

    while (this.accumulator >= this.fixedStepSeconds) {
      store.getState().actions.stepTime(1);
      this.accumulator -= this.fixedStepSeconds;
    }
  }
}
