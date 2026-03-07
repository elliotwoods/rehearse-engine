import { useEffect, useMemo, useState } from "react";
import type { RenderSettings } from "@/features/render/types";

interface ActorOption {
  id: string;
  label: string;
}

interface RenderSettingsModalProps {
  open: boolean;
  isElectron: boolean;
  cameraPathActors: ActorOption[];
  defaults: RenderSettings;
  onCancel: () => void;
  onConfirm: (settings: RenderSettings) => void;
}

function clampInt(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, safe));
}

function clampFloat(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, safe));
}

export function RenderSettingsModal(props: RenderSettingsModalProps) {
  const [draft, setDraft] = useState<RenderSettings>(props.defaults);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (props.open) {
      setDraft(props.defaults);
      setError("");
    }
  }, [props.defaults, props.open]);

  const strategyOptions = useMemo(
    () => [
      { value: "pipe", label: "Pipe (FFmpeg stdin)", disabled: !props.isElectron },
      { value: "temp-folder", label: "Temp folder", disabled: false }
    ],
    [props.isElectron]
  );

  if (!props.open) {
    return null;
  }

  const submit = () => {
    if (!props.isElectron && draft.strategy === "pipe") {
      setError("Pipe rendering is only available in Electron.");
      return;
    }
    if (draft.width < 16 || draft.height < 16) {
      setError("Resolution is too small.");
      return;
    }
    if (draft.durationSeconds <= 0 || draft.fps <= 0) {
      setError("Duration and framerate must be positive.");
      return;
    }
    setError("");
    props.onConfirm({
      ...draft,
      width: clampInt(draft.width, 16, 16384),
      height: clampInt(draft.height, 16, 16384),
      fps: clampInt(draft.fps, 1, 240),
      bitrateMbps: clampFloat(draft.bitrateMbps, 1, 1000),
      durationSeconds: clampFloat(draft.durationSeconds, 0.01, 7200)
    });
  };

  return (
    <div
      className="render-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <div className="render-modal" role="dialog" aria-modal="true" aria-label="Render settings">
        <h3>Render Video</h3>
        <div className="render-modal-grid">
          <label>
            Resolution Width
            <input
              type="number"
              min={16}
              step={1}
              value={draft.width}
              onChange={(event) => setDraft((prev) => ({ ...prev, width: Number(event.target.value) }))}
            />
          </label>
          <label>
            Resolution Height
            <input
              type="number"
              min={16}
              step={1}
              value={draft.height}
              onChange={(event) => setDraft((prev) => ({ ...prev, height: Number(event.target.value) }))}
            />
          </label>
          <label>
            Framerate (fps)
            <input
              type="number"
              min={1}
              step={1}
              value={draft.fps}
              onChange={(event) => setDraft((prev) => ({ ...prev, fps: Number(event.target.value) }))}
            />
          </label>
          <label>
            H.265 Bitrate (Mbps)
            <input
              type="number"
              min={1}
              step={1}
              value={draft.bitrateMbps}
              onChange={(event) => setDraft((prev) => ({ ...prev, bitrateMbps: Number(event.target.value) }))}
            />
          </label>
          <label>
            Duration (s)
            <input
              type="number"
              min={0.01}
              step={0.1}
              value={draft.durationSeconds}
              onChange={(event) => setDraft((prev) => ({ ...prev, durationSeconds: Number(event.target.value) }))}
            />
          </label>
          <label>
            Start Time
            <select
              value={draft.startTimeMode}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  startTimeMode: event.target.value === "zero" ? "zero" : "current"
                }))
              }
            >
              <option value="current">Current</option>
              <option value="zero">0s</option>
            </select>
          </label>
          <label>
            Camera Path
            <select
              value={draft.cameraPathId}
              onChange={(event) => setDraft((prev) => ({ ...prev, cameraPathId: event.target.value }))}
            >
              <option value="">(none)</option>
              {props.cameraPathActors.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Capture Strategy
            <select
              value={draft.strategy}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  strategy: event.target.value === "pipe" ? "pipe" : "temp-folder"
                }))
              }
            >
              {strategyOptions.map((entry) => (
                <option key={entry.value} value={entry.value} disabled={entry.disabled}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p className="render-modal-error">{error}</p> : null}
        <div className="render-modal-actions">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" onClick={submit}>
            Render
          </button>
        </div>
      </div>
    </div>
  );
}
