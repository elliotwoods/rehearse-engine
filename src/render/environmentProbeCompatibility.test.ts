import * as THREE from "three";
import { describe, expect, test } from "vitest";
import type { ActorNode } from "@/core/types";
import {
  environmentProbeCaptureIncompatibilityReason,
  formatEnvironmentProbeSkippedWarning
} from "@/render/environmentProbeCompatibility";

function createActor(overrides: Partial<ActorNode>): ActorNode {
  return {
    id: "actor.test",
    name: "Test Actor",
    enabled: true,
    kind: "actor",
    actorType: "plugin",
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
    params: {},
    ...overrides
  };
}

describe("environment probe compatibility", () => {
  test("marks Mist Volume actors incompatible with WebGPU capture", () => {
    const actor = createActor({
      actorType: "mist-volume"
    });
    expect(environmentProbeCaptureIncompatibilityReason(actor, null, "webgpu")).toBe(
      "Mist Volume actor currently requires WebGL2."
    );
  });

  test("marks ShaderMaterial objects incompatible with WebGPU capture", () => {
    const actor = createActor({});
    const object = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.ShaderMaterial({
        vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "void main() { gl_FragColor = vec4(1.0); }"
      })
    );
    expect(environmentProbeCaptureIncompatibilityReason(actor, object, "webgpu")).toBe(
      "ShaderMaterial is not compatible with WebGPU environment probe capture."
    );
  });

  test("allows standard materials during WebGPU capture", () => {
    const actor = createActor({});
    const object = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    expect(environmentProbeCaptureIncompatibilityReason(actor, object, "webgpu")).toBeNull();
  });

  test("formats skipped actor warnings compactly", () => {
    expect(
      formatEnvironmentProbeSkippedWarning([
        { name: "Mist", reason: "Mist Volume actor currently requires WebGL2." },
        { name: "Custom", reason: "ShaderMaterial is not compatible with WebGPU environment probe capture." }
      ])
    ).toContain("Environment probe skipped 2 actors.");
  });
});
