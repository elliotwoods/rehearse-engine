import type { ReloadableDescriptor } from "@/core/hotReload/types";
import { CAMERA_PATH_ACTOR_SCHEMA } from "@/features/actors/actorTypes";

interface CameraPathRuntime {
  positionCurveActorId: string;
  targetCurveActorId: string;
  targetMode: "curve" | "actor";
  targetActorId: string;
  previewDurationSeconds: number;
}

function getTargetMode(value: unknown): "curve" | "actor" {
  return value === "actor" ? "actor" : "curve";
}

function getPreviewDurationSeconds(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return 5;
  }
  return Math.max(0.1, Math.min(600, raw));
}

export const cameraPathActorDescriptor: ReloadableDescriptor<CameraPathRuntime> = {
  id: "actor.cameraPath",
  kind: "actor",
  version: 1,
  schema: CAMERA_PATH_ACTOR_SCHEMA,
  spawn: {
    actorType: "camera-path",
    label: "Camera Path",
    description: "Managed camera position and target curves with viewport playback tools.",
    iconGlyph: "CP",
    fileExtensions: []
  },
  createRuntime: ({ params }) => ({
    positionCurveActorId: typeof params.positionCurveActorId === "string" ? params.positionCurveActorId : "",
    targetCurveActorId: typeof params.targetCurveActorId === "string" ? params.targetCurveActorId : "",
    targetMode: getTargetMode(params.targetMode),
    targetActorId: typeof params.targetActorId === "string" ? params.targetActorId : "",
    previewDurationSeconds: getPreviewDurationSeconds(params.previewDurationSeconds)
  }),
  updateRuntime(runtime, { params }) {
    runtime.positionCurveActorId = typeof params.positionCurveActorId === "string" ? params.positionCurveActorId : "";
    runtime.targetCurveActorId = typeof params.targetCurveActorId === "string" ? params.targetCurveActorId : "";
    runtime.targetMode = getTargetMode(params.targetMode);
    runtime.targetActorId = typeof params.targetActorId === "string" ? params.targetActorId : "";
    runtime.previewDurationSeconds = getPreviewDurationSeconds(params.previewDurationSeconds);
  },
  status: {
    build({ actor, state }) {
      const positionCurveActorId =
        typeof actor.params.positionCurveActorId === "string" ? actor.params.positionCurveActorId : "";
      const targetCurveActorId = typeof actor.params.targetCurveActorId === "string" ? actor.params.targetCurveActorId : "";
      const targetMode = getTargetMode(actor.params.targetMode);
      const targetActorId = typeof actor.params.targetActorId === "string" ? actor.params.targetActorId : "";
      return [
        { label: "Type", value: "Camera Path" },
        { label: "Position Curve", value: state.actors[positionCurveActorId]?.name ?? "missing" },
        { label: "Target Mode", value: targetMode },
        { label: "Target Curve", value: targetMode === "curve" ? state.actors[targetCurveActorId]?.name ?? "missing" : "hidden" },
        { label: "Target Actor", value: targetMode === "actor" ? state.actors[targetActorId]?.name ?? "unassigned" : "unused" },
        { label: "Preview Duration (s)", value: getPreviewDurationSeconds(actor.params.previewDurationSeconds) }
      ];
    }
  }
};
