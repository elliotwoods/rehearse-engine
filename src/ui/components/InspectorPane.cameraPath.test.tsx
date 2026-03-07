import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { KernelProvider } from "@/app/KernelContext";
import type { AppKernel } from "@/app/kernel";
import { createAppStore } from "@/core/store/appStore";
import { cameraPathActorDescriptor } from "@/features/actors/descriptors/cameraPathActor";
import { curveActorDescriptor } from "@/features/actors/descriptors/curveActor";
import { InspectorPane } from "@/ui/components/InspectorPane";

function createKernelStub(): AppKernel {
  const store = createAppStore("electron-rw");
  return {
    store,
    storage: {} as AppKernel["storage"],
    sessionService: { queueAutosave() {} } as AppKernel["sessionService"],
    hotReloadManager: {} as AppKernel["hotReloadManager"],
    pluginApi: {
      listPlugins: () => []
    } as unknown as AppKernel["pluginApi"],
    descriptorRegistry: {
      listByKind: () => [cameraPathActorDescriptor, curveActorDescriptor]
    } as unknown as AppKernel["descriptorRegistry"],
    clock: {} as AppKernel["clock"]
  };
}

describe("InspectorPane camera path", () => {
  it("renders for a selected new camera path", () => {
    const kernel = createKernelStub();
    const actions = kernel.store.getState().actions;
    const parentId = actions.createActor({ actorType: "camera-path", name: "Camera Path" });
    const positionId = actions.createActor({ actorType: "curve", name: "camera position", parentActorId: parentId });
    const targetId = actions.createActor({ actorType: "curve", name: "camera target", parentActorId: parentId });
    actions.updateActorParams(parentId, {
      positionCurveActorId: positionId,
      targetCurveActorId: targetId,
      targetMode: "curve",
      targetActorId: "",
      keyframes: [{ id: "kf0", timeSeconds: 0 }]
    });
    actions.updateActorParams(positionId, {
      curveData: {
        closed: false,
        points: [{ position: [0, 0, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "mirrored" }]
      }
    });
    actions.updateActorParams(targetId, {
      curveData: {
        closed: false,
        points: [{ position: [0, 0, 1], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "mirrored" }]
      }
    });
    actions.select([{ kind: "actor", id: parentId }]);

    expect(() => render(
      <KernelProvider kernel={kernel}>
        <InspectorPane />
      </KernelProvider>
    )).not.toThrow();
  });
});
