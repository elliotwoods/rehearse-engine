import * as THREE from "three";
import { classifyWorldTransformChange } from "../../../plugins/gaussian-splat-webgpu-plugin/src/transformInvalidation";

function makeMatrix(options?: {
  position?: [number, number, number];
  rotationEuler?: [number, number, number];
  scale?: [number, number, number];
}): THREE.Matrix4 {
  const position = new THREE.Vector3(...(options?.position ?? [0, 0, 0]));
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(options?.rotationEuler ?? [0, 0, 0]), "XYZ")
  );
  const scale = new THREE.Vector3(...(options?.scale ?? [1, 1, 1]));
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

describe("classifyWorldTransformChange", () => {
  it("treats the first observed matrix as a full-sort invalidation", () => {
    const current = makeMatrix({ position: [1, 2, 3] });
    expect(classifyWorldTransformChange(null, current)).toBe("full-sort");
  });

  it("returns none for unchanged transforms", () => {
    const previous = makeMatrix({
      position: [1, 2, 3],
      rotationEuler: [0.1, 0.2, 0.3],
      scale: [2, 2, 2]
    });
    const current = previous.clone();
    expect(classifyWorldTransformChange(previous, current)).toBe("none");
  });

  it("treats translation as depth-only", () => {
    const previous = makeMatrix();
    const current = makeMatrix({ position: [4, -2, 1] });
    expect(classifyWorldTransformChange(previous, current)).toBe("depth-only");
  });

  it("treats positive uniform scale changes as depth-only", () => {
    const previous = makeMatrix({ scale: [2, 2, 2] });
    const current = makeMatrix({ scale: [3, 3, 3] });
    expect(classifyWorldTransformChange(previous, current)).toBe("depth-only");
  });

  it("treats rotation changes as full-sort", () => {
    const previous = makeMatrix();
    const current = makeMatrix({ rotationEuler: [0, Math.PI / 4, 0] });
    expect(classifyWorldTransformChange(previous, current)).toBe("full-sort");
  });

  it("treats non-uniform scale changes as full-sort", () => {
    const previous = makeMatrix({ scale: [1, 1, 1] });
    const current = makeMatrix({ scale: [2, 1, 1] });
    expect(classifyWorldTransformChange(previous, current)).toBe("full-sort");
  });

  it("classifies parent-driven world translations the same as direct translations", () => {
    const parent = makeMatrix({ position: [5, 0, 0] });
    const child = makeMatrix({ position: [1, 0, 0] });
    const previous = parent.clone().multiply(child);

    const movedParent = makeMatrix({ position: [7, 0, 0] });
    const current = movedParent.clone().multiply(child);

    expect(classifyWorldTransformChange(previous, current)).toBe("depth-only");
  });
});
