import { describe, expect, it } from "vitest";
import type { ActorNode } from "@/core/types";
import {
  canUseGpuMistSimulation,
  chooseMistSimulationBackend,
  computeMistDensityFadeFactor,
  pickMistVolumeQuality,
  selectMistDensityTexture,
  simulateMistCpuInjectionForTest
} from "@/render/mistVolumeController";
import * as THREE from "three";

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

  it("keeps auto on the cpu recovery path", () => {
    expect(chooseMistSimulationBackend("auto", gpuRendererStub)).toBe("cpu");
  });
});

describe("simulateMistCpuInjectionForTest", () => {
  it("produces non-zero density and non-zero uploaded bytes for a centered source", () => {
    const result = simulateMistCpuInjectionForTest();
    expect(result.densityRange[1]).toBeGreaterThan(0);
    expect(result.uploadByteRange[1]).toBeGreaterThan(0);
  });
});

describe("computeMistDensityFadeFactor", () => {
  it("is lossless when the explicit fade rate is zero", () => {
    expect(computeMistDensityFadeFactor(0, 1 / 60)).toBe(1);
  });

  it("decreases density more strongly for higher fade rates", () => {
    expect(computeMistDensityFadeFactor(4, 1)).toBeLessThan(computeMistDensityFadeFactor(1, 1));
  });
});

describe("selectMistDensityTexture", () => {
  it("keeps the cpu texture when the backend is cpu", () => {
    const cpuTexture = new THREE.Data3DTexture(new Uint8Array(8), 2, 2, 2);
    const gpuTexture = new THREE.Data3DTexture(null, 2, 2, 2);
    const selected = selectMistDensityTexture(cpuTexture, "cpu", {
      densityTargets: [{ texture: gpuTexture }, { texture: gpuTexture }],
      densityIndex: 0
    } as never);
    expect(selected).toBe(cpuTexture);
  });

  it("uses the active gpu density target only while the gpu backend is active", () => {
    const cpuTexture = new THREE.Data3DTexture(new Uint8Array(8), 2, 2, 2);
    const gpuTexture = new THREE.Data3DTexture(null, 2, 2, 2);
    const selected = selectMistDensityTexture(cpuTexture, "gpu-webgl2", {
      densityTargets: [{ texture: gpuTexture }, { texture: cpuTexture }],
      densityIndex: 0
    } as never);
    expect(selected).toBe(gpuTexture);
  });
});
