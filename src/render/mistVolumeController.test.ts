import { describe, expect, it } from "vitest";
import type { ActorNode } from "@/core/types";
import { canUseGpuMistSimulation, chooseMistSimulationBackend, pickMistVolumeQuality } from "@/render/mistVolumeController";

function createActor(params: ActorNode["params"]): ActorNode {
  return {
    id: "actor.mist",
    name: "Mist",
    enabled: true,
    kind: "actor",
    actorType: "mist-volume",
    visibilityMode: "visible",
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

describe("pickMistVolumeQuality", () => {
  it("uses interactive settings by default", () => {
    const quality = pickMistVolumeQuality(
      createActor({
        resolutionX: 32,
        resolutionY: 24,
        resolutionZ: 16,
        simulationSubsteps: 1,
        previewRaymarchSteps: 48
      }),
      "interactive"
    );
    expect(quality.resolution).toEqual([32, 24, 16]);
    expect(quality.simulationSubsteps).toBe(1);
    expect(quality.previewRaymarchSteps).toBe(48);
  });

  it("uses export override only when enabled", () => {
    const quality = pickMistVolumeQuality(
      createActor({
        resolutionX: 32,
        resolutionY: 24,
        resolutionZ: 16,
        simulationSubsteps: 1,
        previewRaymarchSteps: 48,
        renderOverrideEnabled: true,
        renderResolutionX: 96,
        renderResolutionY: 72,
        renderResolutionZ: 48,
        renderSimulationSubsteps: 3,
        renderPreviewRaymarchSteps: 120
      }),
      "export"
    );
    expect(quality.resolution).toEqual([96, 72, 48]);
    expect(quality.simulationSubsteps).toBe(3);
    expect(quality.previewRaymarchSteps).toBe(120);
  });
});

describe("canUseGpuMistSimulation", () => {
  it("requires WebGL2 and float color buffer support", () => {
    expect(
      canUseGpuMistSimulation({
        capabilities: { isWebGL2: true },
        extensions: { has: (name: string) => name === "EXT_color_buffer_float" }
      } as never)
    ).toBe(true);
    expect(
      canUseGpuMistSimulation({
        capabilities: { isWebGL2: false },
        extensions: { has: () => true }
      } as never)
    ).toBe(false);
    expect(
      canUseGpuMistSimulation({
        capabilities: { isWebGL2: true },
        extensions: { has: () => false }
      } as never)
    ).toBe(false);
  });
});

describe("chooseMistSimulationBackend", () => {
  const gpuRendererStub = {
    capabilities: { isWebGL2: true },
    extensions: { has: (name: string) => name === "EXT_color_buffer_float" }
  } as never;

  it("honors manual cpu override", () => {
    expect(chooseMistSimulationBackend("cpu", gpuRendererStub)).toBe("cpu");
  });

  it("uses gpu when requested and supported", () => {
    expect(chooseMistSimulationBackend("gpu", gpuRendererStub)).toBe("gpu-webgl2");
  });

  it("falls back to cpu when gpu is requested but unavailable", () => {
    expect(
      chooseMistSimulationBackend("gpu", {
        capabilities: { isWebGL2: false },
        extensions: { has: () => false }
      } as never)
    ).toBe("cpu");
  });
});
