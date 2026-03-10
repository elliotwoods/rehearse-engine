import type { RenderExporter, RenderExporterResult } from "@/features/render/exporters";

export interface QueuedRenderExporterState {
  writtenFrameCount: number;
  queuedBytes: number;
}

interface QueuedRenderExporterOptions {
  queueBudgetBytes: number;
  onStateChange?: (state: QueuedRenderExporterState) => void;
}

interface QueuedFrame {
  frameIndex: number;
  framePngBytes: Uint8Array;
}

export interface QueuedRenderExporter {
  enqueueFrame(framePngBytes: Uint8Array, frameIndex: number): Promise<void>;
  finalize(): Promise<RenderExporterResult>;
  abort(): Promise<void>;
  getState(): QueuedRenderExporterState;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

export function createQueuedRenderExporter(
  exporter: RenderExporter,
  options: QueuedRenderExporterOptions
): QueuedRenderExporter {
  const queue: QueuedFrame[] = [];
  const queueBudgetBytes = Math.max(1, Math.floor(options.queueBudgetBytes));
  let queuedBytes = 0;
  let writtenFrameCount = 0;
  let closed = false;
  let aborted = false;
  let consumerWake = deferred();
  let spaceWake = deferred();
  let consumerError: Error | null = null;

  const emitState = () => {
    options.onStateChange?.({
      writtenFrameCount,
      queuedBytes
    });
  };

  const wakeConsumer = () => {
    consumerWake.resolve();
    consumerWake = deferred();
  };

  const wakeSpaceWaiters = () => {
    spaceWake.resolve();
    spaceWake = deferred();
  };

  const consumeLoop = (async () => {
    while (true) {
      if (consumerError) {
        throw consumerError;
      }
      const next = queue.shift();
      if (!next) {
        if (closed || aborted) {
          break;
        }
        await consumerWake.promise;
        continue;
      }
      queuedBytes = Math.max(0, queuedBytes - next.framePngBytes.byteLength);
      wakeSpaceWaiters();
      emitState();
      try {
        await exporter.writeFrame(next.framePngBytes, next.frameIndex);
      } catch (error) {
        consumerError = error instanceof Error ? error : new Error(String(error));
        wakeSpaceWaiters();
        emitState();
        throw consumerError;
      }
      writtenFrameCount = Math.max(writtenFrameCount, next.frameIndex + 1);
      emitState();
    }
  })();

  const waitForSpace = async (incomingBytes: number) => {
    while (!aborted && !consumerError && queue.length > 0 && queuedBytes + incomingBytes > queueBudgetBytes) {
      await spaceWake.promise;
    }
    if (consumerError) {
      throw consumerError;
    }
  };

  return {
    async enqueueFrame(framePngBytes, frameIndex) {
      if (closed || aborted) {
        throw new Error("Render exporter queue is closed.");
      }
      if (consumerError) {
        throw consumerError;
      }
      await waitForSpace(framePngBytes.byteLength);
      if (closed || aborted) {
        throw new Error("Render exporter queue is closed.");
      }
      queue.push({
        frameIndex,
        framePngBytes
      });
      queuedBytes += framePngBytes.byteLength;
      emitState();
      wakeConsumer();
    },
    async finalize() {
      if (aborted) {
        throw new Error("Render exporter queue was aborted.");
      }
      closed = true;
      wakeConsumer();
      await consumeLoop;
      return await exporter.finalize();
    },
    async abort() {
      if (aborted) {
        return;
      }
      aborted = true;
      queue.length = 0;
      queuedBytes = 0;
      emitState();
      wakeConsumer();
      wakeSpaceWaiters();
      await exporter.abort();
    },
    getState() {
      return {
        writtenFrameCount,
        queuedBytes
      };
    }
  };
}
