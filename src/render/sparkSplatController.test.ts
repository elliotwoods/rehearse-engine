import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ActorNode, ParameterValues } from "@/core/types";
import { SparkSplatController } from "@/render/sparkSplatController";
import { applySparkStochasticDepthMode, isSparkStochasticDepthEnabled } from "@/render/sparkSplatController";

function createActor(params: ParameterValues): ActorNode {
  return {
    id: "actor.spark",
    name: "Spark",
    enabled: true,
    kind: "actor",
    actorType: "gaussian-splat-spark",
    visibilityMode: "visible",
    pluginType: undefined,
    parentActorId: null,
    childActorIds: [],
    componentIds: [],
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    params
  };
}

describe("spark stochastic depth helpers", () => {
  it("treats the actor toggle as disabled by default", () => {
    expect(isSparkStochasticDepthEnabled(createActor({}))).toBe(false);
  });

  it("reads the actor toggle when enabled", () => {
    expect(isSparkStochasticDepthEnabled(createActor({ stochasticDepth: true }))).toBe(true);
  });

  it("applies stochastic depth to Spark viewpoints and material state", () => {
    const mesh = {
      defaultView: { stochastic: false },
      viewpoint: { stochastic: false },
      prepareViewpoint: () => undefined,
      material: {
        transparent: true,
        depthWrite: false,
        needsUpdate: false
      }
    };

    applySparkStochasticDepthMode(mesh, true);

    expect(mesh.defaultView.stochastic).toBe(true);
    expect(mesh.viewpoint.stochastic).toBe(true);
    expect(mesh.material.transparent).toBe(false);
    expect(mesh.material.depthWrite).toBe(true);
    expect(mesh.material.needsUpdate).toBe(true);
  });

  it("restores alpha-blended mode when stochastic depth is disabled", () => {
    const mesh = {
      defaultView: { stochastic: true },
      viewpoint: { stochastic: true },
      prepareViewpoint: () => undefined,
      material: {
        transparent: false,
        depthWrite: true,
        needsUpdate: false
      }
    };

    applySparkStochasticDepthMode(mesh, false);

    expect(mesh.defaultView.stochastic).toBe(false);
    expect(mesh.viewpoint.stochastic).toBe(false);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.needsUpdate).toBe(true);
  });

  it("keeps the corrected root mounted when disposing a splat entry", () => {
    const renderRoot = new THREE.Group();
    const correctedRoot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()) as any;
    mesh.dispose = vi.fn();
    correctedRoot.add(mesh);
    renderRoot.add(correctedRoot);

    const controller = new SparkSplatController({} as any, {} as any);
    (controller as any).entriesByActorId.set("actor.spark", {
      assetId: "asset.splat",
      reloadToken: 1,
      mesh,
      correctedRoot
    });

    (controller as any).disposeActorEntry("actor.spark");

    expect(correctedRoot.parent).toBe(renderRoot);
    expect(correctedRoot.children).toHaveLength(0);
    expect(mesh.parent).toBeNull();
    expect(mesh.dispose).toHaveBeenCalledTimes(1);
  });

  it("reports a warning when WebGL2 ignores the requested color transform", () => {
    const setActorStatus = vi.fn();
    const controller = new SparkSplatController(
      {
        store: {
          getState: () => ({
            actions: {
              setActorStatus
            }
          })
        }
      } as any,
      {} as any
    );

    (controller as any).pointCount = 123;
    (controller as any).bounds = {
      min: [0, 0, 0],
      max: [1, 1, 1]
    };

    (controller as any).reportLoadedStatus(
      createActor({ colorInputSpace: "apple-log", splatSizeScale: 1 }),
      "asset.splat",
      123,
      {
        min: [0, 0, 0],
        max: [1, 1, 1]
      }
    );

    expect(setActorStatus).toHaveBeenCalledTimes(1);
    expect(setActorStatus).toHaveBeenCalledWith(
      "actor.spark",
      expect.objectContaining({
        values: expect.objectContaining({
          backend: "spark-webgl",
          loadState: "loaded",
          warning: expect.stringContaining("Splat Output Transform \"apple-log\" is ignored in WebGL2.")
        })
      })
    );
  });
});
