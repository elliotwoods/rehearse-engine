import type { AppState, CameraState } from "@/core/types";
import { sampleCameraPathPoseAtProgress, type ArcLengthSample } from "@/features/cameraPath/model";

export function solveRenderCamera(
  state: AppState,
  baseCamera: CameraState,
  progress: number,
  cameraPathId: string,
  pathArcTableCache: Map<string, ArcLengthSample[]>
): CameraState {
  const next: CameraState = structuredClone(baseCamera);
  const cameraPathActor = cameraPathId ? state.actors[cameraPathId] : undefined;
  if (!cameraPathActor || cameraPathActor.actorType !== "camera-path") {
    return next;
  }
  const pose = sampleCameraPathPoseAtProgress(cameraPathActor, state.actors, progress, pathArcTableCache);
  if (!pose) {
    return next;
  }
  next.position = pose.position;
  next.target = pose.target;
  return next;
}
