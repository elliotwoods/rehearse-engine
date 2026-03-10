import { useEffect, useMemo, useState } from "react";
import {
  defaultRenderCameraPathId,
  detectResolutionPreset,
  findRenderCameraPath,
  RENDER_RESOLUTION_PRESETS,
  resolutionForPreset,
  resolveRenderDurationSeconds
} from "@/features/render/settings";
import type {
  RenderCameraPathOption,
  RenderResolutionPreset,
  RenderSettings,
  RenderSupersampleScale
} from "@/features/render/types";
import { BufferedNumberTextInput } from "@/ui/widgets/BufferedNumberTextInput";

interface RenderSettingsModalProps {
  open: boolean;
  isElectron: boolean;
  cameraPathActors: RenderCameraPathOption[];
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

function normalizePreset(value: string): RenderResolutionPreset {
  return value === "fhd" || value === "4k" || value === "8k" || value === "8k2k" ? value : "custom";
}

function normalizeSupersampleScale(value: string): RenderSupersampleScale {
  return value === "2" ? 2 : value === "4" ? 4 : 1;
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

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setDraft((prev) => {
      const selected = findRenderCameraPath(props.cameraPathActors, prev.cameraPathId);
      if (prev.cameraPathId && selected) {
        return prev;
      }
      const fallbackId = defaultRenderCameraPathId(props.cameraPathActors);
      if (fallbackId === prev.cameraPathId) {
        return prev;
      }
      return { ...prev, cameraPathId: fallbackId };
    });
  }, [props.cameraPathActors, props.open]);

  const strategyOptions = useMemo(
    () => [
      { value: "pipe", label: "Pipe (FFmpeg stdin)", disabled: !props.isElectron },
      { value: "temp-folder", label: "Temp folder", disabled: false }
    ],
    [props.isElectron]
  );
  const selectedCameraPath = useMemo(
    () => findRenderCameraPath(props.cameraPathActors, draft.cameraPathId),
    [draft.cameraPathId, props.cameraPathActors]
  );
  const effectiveDurationSeconds = resolveRenderDurationSeconds(draft, props.cameraPathActors);
  const internalWidth = draft.width * draft.supersampleScale;
  const internalHeight = draft.height * draft.supersampleScale;

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
    if (draft.fps <= 0) {
      setError("Framerate must be positive.");
      return;
    }
    if (!selectedCameraPath && draft.durationSeconds <= 0) {
      setError("Duration must be positive.");
      return;
    }
    if (draft.preRunSeconds < 0) {
      setError("Pre-run time cannot be negative.");
      return;
    }
    setError("");
    props.onConfirm({
      ...draft,
      width: clampInt(draft.width, 16, 16384),
      height: clampInt(draft.height, 16, 16384),
      fps: clampInt(draft.fps, 1, 240),
      bitrateMbps: clampFloat(draft.bitrateMbps, 1, 1000),
      durationSeconds: clampFloat(effectiveDurationSeconds, 0.01, 7200),
      preRunSeconds: clampFloat(draft.preRunSeconds, 0, 7200)
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
            Resolution Preset
            <select
              value={draft.resolutionPreset}
              onChange={(event) => {
                const preset = normalizePreset(event.target.value);
                const resolved = resolutionForPreset(preset);
                setDraft((prev) => ({
                  ...prev,
                  resolutionPreset: preset,
                  width: resolved?.width ?? prev.width,
                  height: resolved?.height ?? prev.height
                }));
              }}
            >
              <option value="custom">Custom</option>
              {RENDER_RESOLUTION_PRESETS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} ({entry.width}×{entry.height})
                </option>
              ))}
            </select>
          </label>
          <label>
            Resolution Width
            <BufferedNumberTextInput
              value={draft.width}
              min={16}
              step={1}
              precision={0}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  width: event,
                  resolutionPreset: detectResolutionPreset(event, prev.height)
                }))
              }
            />
          </label>
          <label>
            Resolution Height
            <BufferedNumberTextInput
              value={draft.height}
              min={16}
              step={1}
              precision={0}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  height: event,
                  resolutionPreset: detectResolutionPreset(prev.width, event)
                }))
              }
            />
          </label>
          <label>
            Sampling
            <select
              value={String(draft.supersampleScale)}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  supersampleScale: normalizeSupersampleScale(event.target.value)
                }))
              }
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
            </select>
          </label>
          <label>
            Framerate (fps)
            <BufferedNumberTextInput
              value={draft.fps}
              min={1}
              step={1}
              precision={0}
              onChange={(next) => setDraft((prev) => ({ ...prev, fps: next }))}
            />
          </label>
          <label>
            H.265 Bitrate (Mbps)
            <BufferedNumberTextInput
              value={draft.bitrateMbps}
              min={1}
              step={1}
              precision={0}
              onChange={(next) => setDraft((prev) => ({ ...prev, bitrateMbps: next }))}
            />
          </label>
          <label>
            Camera Path
            <select
              value={draft.cameraPathId}
              onChange={(event) => setDraft((prev) => ({ ...prev, cameraPathId: event.target.value }))}
            >
              <option value="">Current editor camera</option>
              {props.cameraPathActors.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} ({entry.durationSeconds.toFixed(2)}s)
                </option>
              ))}
            </select>
          </label>
          <label>
            Duration (s)
            <BufferedNumberTextInput
              value={selectedCameraPath ? effectiveDurationSeconds : draft.durationSeconds}
              min={0.01}
              step={0.1}
              precision={1}
              disabled={Boolean(selectedCameraPath)}
              onChange={(next) => setDraft((prev) => ({ ...prev, durationSeconds: next }))}
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
            Pre-run (s)
            <BufferedNumberTextInput
              value={draft.preRunSeconds}
              min={0}
              step={0.1}
              precision={1}
              onChange={(next) => setDraft((prev) => ({ ...prev, preRunSeconds: next }))}
            />
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
          <label className="render-modal-checkbox">
            <span>Render Debug Views</span>
            <input
              type="checkbox"
              checked={draft.showDebugViews}
              onChange={(event) => setDraft((prev) => ({ ...prev, showDebugViews: event.target.checked }))}
            />
          </label>
          <div className="render-modal-note render-modal-span-3">
            <strong>Output:</strong> {draft.width}×{draft.height}
            {" · "}
            <strong>Internal render:</strong> {internalWidth}×{internalHeight}
            {selectedCameraPath ? (
              <>
                {" · "}
                <strong>Camera path duration:</strong> {effectiveDurationSeconds.toFixed(2)}s
              </>
            ) : null}
          </div>
          {selectedCameraPath ? (
            <div className="render-modal-note render-modal-span-3">
              Duration is locked to the selected camera path. Pre-run warms simulation state only and does not offset the
              camera path timing.
            </div>
          ) : null}
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
