import { describe, expect, it } from "vitest";
import type { ActorNode } from "@/core/types";
import { sampleCameraPathPoseAtProgress } from "@/features/cameraPath/model";

function createActor(input: Partial<ActorNode> & Pick<ActorNode, "id" | "actorType" | "name">): ActorNode {
  return {
    id: input.id,
    name: input.name,
    enabled: true,
    kind: "actor",
    actorType: input.actorType,
    visibilityMode: "visible",
    parentActorId: input.parentActorId ?? null,
    childActorIds: input.childActorIds ?? [],
    componentIds: [],
    transform: input.transform ?? {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    params: input.params ?? {}
  };
}

describe("cameraPath model", () => {
  it("samples curve-target camera paths from managed child curves", () => {
    const cameraPath = createActor({
      id: "path",
      actorType: "camera-path",
      name: "Camera Path",
      params: {
        positionCurveActorId: "position",
        targetCurveActorId: "target",
        targetMode: "curve"
      }
    });
    const positionCurve = createActor({
      id: "position",
      actorType: "curve",
      name: "camera position",
      parentActorId: "path",
      params: {
        curveData: {
          closed: false,
          points: [{ position: [5, 6, 7], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "mirrored" }]
        }
      }
    });
    const targetCurve = createActor({
      id: "target",
      actorType: "curve",
      name: "camera target",
      parentActorId: "path",
      params: {
        curveData: {
          closed: false,
          points: [{ position: [1, 2, 3], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "mirrored" }]
        }
      }
    });

    const pose = sampleCameraPathPoseAtProgress(cameraPath, {
      [cameraPath.id]: cameraPath,
      [positionCurve.id]: positionCurve,
      [targetCurve.id]: targetCurve
    }, 0.5);

    expect(pose).toEqual({
      position: [5, 6, 7],
      target: [1, 2, 3]
    });
  });

  it("samples actor-target camera paths using the target actor origin", () => {
    const cameraPath = createActor({
      id: "path",
      actorType: "camera-path",
      name: "Camera Path",
      params: {
        positionCurveActorId: "position",
        targetCurveActorId: "target-curve",
        targetMode: "actor",
        targetActorId: "target-actor"
      }
    });
    const positionCurve = createActor({
      id: "position",
      actorType: "curve",
      name: "camera position",
      parentActorId: "path",
      params: {
        curveData: {
          closed: false,
          points: [{ position: [9, 8, 7], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "mirrored" }]
        }
      }
    });
    const targetActor = createActor({
      id: "target-actor",
      actorType: "empty",
      name: "Target",
      transform: {
        position: [3, 4, 5],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      }
    });

    const pose = sampleCameraPathPoseAtProgress(cameraPath, {
      [cameraPath.id]: cameraPath,
      [positionCurve.id]: positionCurve,
      [targetActor.id]: targetActor
    }, 0.25);

    expect(pose).toEqual({
      position: [9, 8, 7],
      target: [3, 4, 5]
    });
  });
});
