import type { AppState, CameraState } from "@/core/types";
import { sampleCameraPathPoseAtTime } from "@/features/cameraPath/model";

export function solveRenderCamera(
  state: AppState,
  baseCamera: CameraState,
  elapsedCameraTimeSeconds: number,
  cameraPathId: string
): CameraState {
  const next: CameraState = structuredClone(baseCamera);
  const cameraPathActor = cameraPathId ? state.actors[cameraPathId] : undefined;
  if (!cameraPathActor || cameraPathActor.actorType !== "camera-path") {
    return next;
  }
  const pose = sampleCameraPathPoseAtTime(cameraPathActor, state.actors, elapsedCameraTimeSeconds);
  if (!pose) {
    return next;
  }
  next.position = pose.position;
  next.target = pose.target;
  return next;
}
