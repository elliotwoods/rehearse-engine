import * as THREE from "three";
import { WebGPUCoordinateSystem } from "three";
import { describe, expect, it } from "vitest";
import {
  buildChunks,
  updateChunkVisibility,
  type ChunkData
} from "../../../plugins/gaussian-splat-webgpu-plugin/src/splatChunks";

function makePerspectiveCamera(position: [number, number, number], target: [number, number, number]): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 1000);
  camera.coordinateSystem = WebGPUCoordinateSystem;
  camera.position.set(...position);
  camera.lookAt(new THREE.Vector3(...target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function exactVisibleIds(
  positions: Float32Array,
  count: number,
  camera: THREE.Camera,
  modelWorldMatrix: THREE.Matrix4
): Set<number> {
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const worldPosition = new THREE.Vector3();
  const clipPosition = new THREE.Vector4();
  const visible = new Set<number>();
  const usesWebGpuDepth = camera.coordinateSystem === WebGPUCoordinateSystem;

  for (let index = 0; index < count; index += 1) {
    const i3 = index * 3;
    worldPosition.set(positions[i3], positions[i3 + 1], positions[i3 + 2]).applyMatrix4(modelWorldMatrix);
    clipPosition.set(worldPosition.x, worldPosition.y, worldPosition.z, 1).applyMatrix4(viewProjection);
    if (clipPosition.w === 0) {
      continue;
    }
    const ndcX = clipPosition.x / clipPosition.w;
    const ndcY = clipPosition.y / clipPosition.w;
    const ndcZ = clipPosition.z / clipPosition.w;
    const visibleDepth = usesWebGpuDepth ? ndcZ >= 0 && ndcZ <= 1 : ndcZ >= -1 && ndcZ <= 1;
    if (ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1 && visibleDepth) {
      visible.add(index);
    }
  }

  return visible;
}

function keptSplatIds(
  chunkData: ChunkData,
  count: number,
  camera: THREE.Camera,
  modelWorldMatrix: THREE.Matrix4
): Set<number> {
  const visibility = new Uint32Array(chunkData.chunks.length);
  updateChunkVisibility(chunkData, camera, modelWorldMatrix, visibility);
  const kept = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    if (visibility[chunkData.chunkIds[index] ?? 0] === 1) {
      kept.add(index);
    }
  }
  return kept;
}

function manualChunkDataForPoints(
  positions: Float32Array,
  count: number,
  halfExtent = 0.05
): ChunkData {
  const chunks = [];
  const chunkIds = new Uint16Array(count);
  for (let index = 0; index < count; index += 1) {
    const i3 = index * 3;
    const x = positions[i3];
    const y = positions[i3 + 1];
    const z = positions[i3 + 2];
    chunks.push({
      min: [x - halfExtent, y - halfExtent, z - halfExtent] as [number, number, number],
      max: [x + halfExtent, y + halfExtent, z + halfExtent] as [number, number, number]
    });
    chunkIds[index] = index;
  }
  return {
    chunks,
    chunkIds,
    chunkPointCounts: Uint32Array.from({ length: count }, () => 1)
  };
}

function setEquals(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

function isSupersetOf(candidate: Set<number>, expectedSubset: Set<number>): boolean {
  for (const value of expectedSubset) {
    if (!candidate.has(value)) {
      return false;
    }
  }
  return true;
}

describe("gaussian splat chunk culling", () => {
  it("matches an exact clip-space route when each splat has its own chunk", () => {
    const positions = new Float32Array([
      -6, 0, 0,
      -2, 0, 0,
       2, 0, 0,
       6, 0, 0,
      10, 0, 0
    ]);
    const count = positions.length / 3;
    const chunkData = manualChunkDataForPoints(positions, count, 0.01);
    const modelWorld = new THREE.Matrix4().identity();

    const baselineCamera = makePerspectiveCamera([0, 2, 10], [0, 0, 0]);
    const translatedCamera = makePerspectiveCamera([6, 2, 10], [6, 0, 0]);
    const rotatedCamera = makePerspectiveCamera([6, 2, 10], [0, 0, 0]);

    const baselineExact = exactVisibleIds(positions, count, baselineCamera, modelWorld);
    const translatedExact = exactVisibleIds(positions, count, translatedCamera, modelWorld);
    const rotatedExact = exactVisibleIds(positions, count, rotatedCamera, modelWorld);

    expect(setEquals(keptSplatIds(chunkData, count, baselineCamera, modelWorld), baselineExact)).toBe(true);
    expect(setEquals(keptSplatIds(chunkData, count, translatedCamera, modelWorld), translatedExact)).toBe(true);
    expect(setEquals(keptSplatIds(chunkData, count, rotatedCamera, modelWorld), rotatedExact)).toBe(true);
    expect(setEquals(baselineExact, translatedExact)).toBe(false);
    expect(setEquals(translatedExact, rotatedExact)).toBe(false);
  });

  it("tracks translation changes against an exact reference route for built chunks", () => {
    const width = 160;
    const depth = 96;
    const count = width * depth;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);

    let write = 0;
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const i3 = write * 3;
        positions[i3] = -18 + (36 * x) / (width - 1);
        positions[i3 + 1] = 0;
        positions[i3 + 2] = -6 + (12 * z) / (depth - 1);
        scales[i3] = 0.03;
        scales[i3 + 1] = 0.03;
        scales[i3 + 2] = 0.03;
        write += 1;
      }
    }

    const chunkData = buildChunks(positions, scales, count);
    const modelWorld = new THREE.Matrix4().identity();

    const baselineCamera = makePerspectiveCamera([0, 8, 20], [0, 0, 0]);
    const translatedCamera = makePerspectiveCamera([10, 8, 20], [10, 0, 0]);
    const rotatedCamera = makePerspectiveCamera([10, 8, 20], [0, 0, 0]);

    const baselineExact = exactVisibleIds(positions, count, baselineCamera, modelWorld);
    const translatedExact = exactVisibleIds(positions, count, translatedCamera, modelWorld);
    const rotatedExact = exactVisibleIds(positions, count, rotatedCamera, modelWorld);

    const baselineKept = keptSplatIds(chunkData, count, baselineCamera, modelWorld);
    const translatedKept = keptSplatIds(chunkData, count, translatedCamera, modelWorld);
    const rotatedKept = keptSplatIds(chunkData, count, rotatedCamera, modelWorld);

    expect(isSupersetOf(baselineKept, baselineExact)).toBe(true);
    expect(isSupersetOf(translatedKept, translatedExact)).toBe(true);
    expect(isSupersetOf(rotatedKept, rotatedExact)).toBe(true);

    expect(setEquals(baselineExact, translatedExact)).toBe(false);
    expect(setEquals(baselineKept, translatedKept)).toBe(false);
    expect(setEquals(translatedExact, rotatedExact)).toBe(false);
    expect(setEquals(translatedKept, rotatedKept)).toBe(false);
  });
});
