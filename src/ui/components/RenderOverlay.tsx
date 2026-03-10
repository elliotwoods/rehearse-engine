import { useEffect, useRef, useState } from "react";
import type { RenderProgress } from "@/features/render/types";

interface RenderOverlayProps {
  open: boolean;
  progress: RenderProgress | null;
  onHostReady: (host: HTMLDivElement | null) => void;
  onPreviewReady: (canvas: HTMLCanvasElement | null) => void;
  onCancel: () => void;
}

function formatDuration(valueMs: number | null): string {
  if (valueMs === null || !Number.isFinite(valueMs)) {
    return "estimating";
  }
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatQueuedBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function progressLabel(progress: RenderProgress | null): string {
  if (!progress) {
    return "Starting render...";
  }
  const phaseIndex = Math.min(progress.phaseIndex, progress.phaseCount);
  if (progress.phase === "pre-run") {
    return `Pre-run frame ${phaseIndex} / ${progress.phaseCount}`;
  }
  if (progress.phase === "render") {
    return `Render frame ${phaseIndex} / ${progress.phaseCount}`;
  }
  if (progress.phase === "write") {
    return `Writing frame ${phaseIndex} / ${progress.phaseCount}`;
  }
  if (progress.phase === "drain") {
    return `Draining output queue (${progress.writtenFrameCount} / ${progress.phaseCount})`;
  }
  return "Preparing render...";
}

export function RenderOverlay({ open, progress, onHostReady, onPreviewReady, onCancel }: RenderOverlayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const startedAtMsRef = useRef<number | null>(null);
  const [nowMs, setNowMs] = useState(() => performance.now());

  useEffect(() => {
    onHostReady(open ? hostRef.current : null);
    return () => {
      onHostReady(null);
    };
  }, [onHostReady, open]);

  useEffect(() => {
    onPreviewReady(open ? previewRef.current : null);
    return () => {
      onPreviewReady(null);
    };
  }, [onPreviewReady, open]);

  useEffect(() => {
    if (!open) {
      startedAtMsRef.current = null;
      return;
    }
    if (progress && startedAtMsRef.current === null) {
      startedAtMsRef.current = performance.now();
    }
  }, [open, progress]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handle = window.setInterval(() => {
      setNowMs(performance.now());
    }, 250);
    return () => {
      window.clearInterval(handle);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const overallUnitsCompleted = progress?.overallUnitsCompleted ?? 0;
  const overallUnitsTotal = progress?.overallUnitsTotal ?? 0;
  const ratio =
    overallUnitsTotal > 0 ? Math.max(0, Math.min(1, overallUnitsCompleted / overallUnitsTotal)) : 0;
  const startedAtMs = startedAtMsRef.current;
  const elapsedMs = startedAtMs === null ? 0 : Math.max(0, nowMs - startedAtMs);
  const estimatedTotalMs = ratio > 0 ? elapsedMs / ratio : null;
  const estimatedRemainingMs = estimatedTotalMs === null ? null : Math.max(0, estimatedTotalMs - elapsedMs);

  return (
    <div className="render-overlay-backdrop">
      <div className="render-overlay">
        <header>
          <h3>Rendering</h3>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <div className="render-overlay-preview-panel">
          <canvas className="render-overlay-preview-canvas" ref={previewRef} />
          <div className="render-overlay-render-host" ref={hostRef} aria-hidden="true" />
        </div>
        <footer>
          <div className="render-overlay-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio * 100}>
            <span style={{ width: `${ratio * 100}%` }} />
          </div>
          <p>{progressLabel(progress)}</p>
          <p>Status: {progress?.message ?? "Preparing..."}</p>
          {progress ? (
            <p>
              Output {progress.writtenFrameCount} / {progress.renderFrameCountTotal}
              {" · "}
              Queue {formatQueuedBytes(progress.queuedBytes)} / {formatQueuedBytes(progress.queueBudgetBytes)}
            </p>
          ) : null}
          <p>
            Time {formatDuration(elapsedMs)} elapsed
            {" · "}
            {formatDuration(estimatedRemainingMs)} remaining
            {" · "}
            {formatDuration(estimatedTotalMs)} total
          </p>
        </footer>
      </div>
    </div>
  );
}
