import { describe, expect, it, vi } from "vitest";
import { createQueuedRenderExporter } from "@/features/render/queuedExporter";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("createQueuedRenderExporter", () => {
  it("writes queued frames in order and finalizes after draining", async () => {
    const first = deferred();
    const second = deferred();
    const writes: number[] = [];
    const exporter = {
      writeFrame: vi.fn(async (_bytes: Uint8Array, frameIndex: number) => {
        writes.push(frameIndex);
        await (frameIndex === 0 ? first.promise : second.promise);
      }),
      finalize: vi.fn(async () => ({ summary: "done" })),
      abort: vi.fn(async () => undefined)
    };
    const queue = createQueuedRenderExporter(exporter, {
      queueBudgetBytes: 1024
    });

    await queue.enqueueFrame(new Uint8Array(8), 0);
    await queue.enqueueFrame(new Uint8Array(8), 1);

    const finalizePromise = queue.finalize();
    await Promise.resolve();
    expect(writes).toEqual([0]);
    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual([0, 1]);
    second.resolve();
    await expect(finalizePromise).resolves.toEqual({ summary: "done" });
    expect(exporter.finalize).toHaveBeenCalledTimes(1);
  });

  it("backpressures when queued bytes exceed the budget", async () => {
    const gate = deferred();
    const exporter = {
      writeFrame: vi.fn(async (_bytes: Uint8Array, frameIndex: number) => {
        if (frameIndex === 0) {
          await gate.promise;
        }
      }),
      finalize: vi.fn(async () => ({ summary: "done" })),
      abort: vi.fn(async () => undefined)
    };
    const queue = createQueuedRenderExporter(exporter, {
      queueBudgetBytes: 10
    });

    await queue.enqueueFrame(new Uint8Array(8), 0);
    await queue.enqueueFrame(new Uint8Array(8), 1);
    let unblocked = false;
    const blocked = queue.enqueueFrame(new Uint8Array(8), 2).then(() => {
      unblocked = true;
    });

    await Promise.resolve();
    expect(unblocked).toBe(false);
    gate.resolve();
    await blocked;
    await queue.abort();
  });
});
