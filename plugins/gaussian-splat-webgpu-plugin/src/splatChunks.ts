/**
 * Spatial chunking for gaussian splat frustum culling.
 *
 * Divides splats into spatial blocks (chunks) using a uniform 3D grid.
 * Each chunk has a bounding sphere that can be quickly tested against the
 * camera frustum on CPU each frame. Only ~100-200 chunks need testing
 * rather than 100k+ individual splats.
 *
 * Pattern follows src/render/sceneController.ts buildGaussianSortChunks().
 */

import * as THREE from "three";

export interface SplatChunk {
  /** Model-space bounding sphere center */
  center: [number, number, number];
  /** Bounding sphere radius (includes max splat extent) */
  radius: number;
}

export interface ChunkData {
  /** All spatial chunks */
  chunks: SplatChunk[];
  /** Per-splat chunk assignment: chunkIds[splatIndex] = chunkIndex */
  chunkIds: Uint16Array;
}

/**
 * Build spatial chunks from splat positions and scales.
 *
 * @param positions Float32Array [x,y,z] interleaved, length = count * 3
 * @param scales    Float32Array [sx,sy,sz] interleaved, length = count * 3
 * @param count     Number of splats
 * @returns ChunkData with chunks and per-splat chunk ID assignments
 */
export function buildChunks(
  positions: Float32Array,
  scales: Float32Array,
  count: number
): ChunkData {
  if (count <= 0) {
    return { chunks: [], chunkIds: new Uint16Array(0) };
  }

  // Compute AABB
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = positions[i3];
    const y = positions[i3 + 1];
    const z = positions[i3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  // For small counts, use a single chunk
  if (count <= 2048) {
    return buildSingleChunk(positions, scales, count, minX, minY, minZ, maxX, maxY, maxZ);
  }

  // Uniform 3D grid subdivision
  const extentX = Math.max(0.001, maxX - minX);
  const extentY = Math.max(0.001, maxY - minY);
  const extentZ = Math.max(0.001, maxZ - minZ);
  const targetChunkCount = Math.max(1, Math.ceil(count / 2048));
  const grid = Math.max(1, Math.round(Math.cbrt(targetChunkCount)));
  const cellX = extentX / grid;
  const cellY = extentY / grid;
  const cellZ = extentZ / grid;

  // Assign splats to grid cells
  const bucketMap = new Map<number, number[]>();
  const chunkIds = new Uint16Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = positions[i3];
    const y = positions[i3 + 1];
    const z = positions[i3 + 2];
    const gx = Math.max(0, Math.min(grid - 1, Math.floor((x - minX) / cellX)));
    const gy = Math.max(0, Math.min(grid - 1, Math.floor((y - minY) / cellY)));
    const gz = Math.max(0, Math.min(grid - 1, Math.floor((z - minZ) / cellZ)));
    const key = gx + gy * grid + gz * grid * grid;

    const bucket = bucketMap.get(key);
    if (bucket) {
      bucket.push(i);
    } else {
      bucketMap.set(key, [i]);
    }
  }

  // Build chunks from non-empty buckets
  const chunks: SplatChunk[] = [];
  let chunkIndex = 0;

  for (const indices of bucketMap.values()) {
    if (indices.length <= 0) continue;

    // Compute bounding sphere center (centroid of splats in this cell)
    let cx = 0, cy = 0, cz = 0;
    for (const idx of indices) {
      const i3 = idx * 3;
      cx += positions[i3];
      cy += positions[i3 + 1];
      cz += positions[i3 + 2];
    }
    cx /= indices.length;
    cy /= indices.length;
    cz /= indices.length;

    // Compute bounding sphere radius (max distance from center + splat extent)
    let radius = 0.001;
    for (const idx of indices) {
      const i3 = idx * 3;
      const dx = positions[i3] - cx;
      const dy = positions[i3 + 1] - cy;
      const dz = positions[i3 + 2] - cz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Add splat extent (3-sigma of the largest scale axis)
      const sx = Math.abs(scales[i3]);
      const sy = Math.abs(scales[i3 + 1]);
      const sz = Math.abs(scales[i3 + 2]);
      const maxScale = Math.max(sx, sy, sz);
      const extent = maxScale * 3.0; // 3-sigma

      radius = Math.max(radius, dist + extent);
    }

    // Assign chunk ID to all splats in this bucket
    for (const idx of indices) {
      chunkIds[idx] = chunkIndex;
    }

    chunks.push({
      center: [cx, cy, cz],
      radius
    });
    chunkIndex++;
  }

  return { chunks, chunkIds };
}

/**
 * Build a single chunk encompassing all splats (for small counts).
 */
function buildSingleChunk(
  positions: Float32Array,
  scales: Float32Array,
  count: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number
): ChunkData {
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  let radius = 0.001;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const dx = positions[i3] - cx;
    const dy = positions[i3 + 1] - cy;
    const dz = positions[i3 + 2] - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const sx = Math.abs(scales[i3]);
    const sy = Math.abs(scales[i3 + 1]);
    const sz = Math.abs(scales[i3 + 2]);
    const maxScale = Math.max(sx, sy, sz);
    const extent = maxScale * 3.0;

    radius = Math.max(radius, dist + extent);
  }

  const chunkIds = new Uint16Array(count); // all zeros → chunk 0
  const chunks: SplatChunk[] = [{ center: [cx, cy, cz], radius }];

  return { chunks, chunkIds };
}

// --- Per-frame frustum visibility ---

// Reusable scratch objects (allocated once, not per-frame)
const _projViewMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const _centerWorld = new THREE.Vector3();
const _worldScale = new THREE.Vector3();

/**
 * Update chunk visibility based on camera frustum.
 *
 * @param chunkData     The chunk data from buildChunks()
 * @param camera        Current camera
 * @param modelWorldMatrix The mesh's matrixWorld (includes coordinate correction)
 * @param outVisibility Uint32Array of length numChunks, mutated in place (1 = visible, 0 = culled)
 * @returns Number of visible chunks
 */
export function updateChunkVisibility(
  chunkData: ChunkData,
  camera: THREE.Camera,
  modelWorldMatrix: THREE.Matrix4,
  outVisibility: Uint32Array
): number {
  const { chunks } = chunkData;
  const numChunks = chunks.length;

  // Build frustum from camera
  _projViewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_projViewMatrix);

  // Get model world scale for radius adjustment
  _worldScale.setFromMatrixScale(modelWorldMatrix);
  const radiusScale = Math.max(
    Math.abs(_worldScale.x),
    Math.abs(_worldScale.y),
    Math.abs(_worldScale.z)
  );

  let visibleCount = 0;

  for (let i = 0; i < numChunks; i++) {
    const chunk = chunks[i];
    _centerWorld.set(chunk.center[0], chunk.center[1], chunk.center[2]);
    _centerWorld.applyMatrix4(modelWorldMatrix);

    _sphere.center.copy(_centerWorld);
    _sphere.radius = Math.max(0.001, chunk.radius * radiusScale);

    if (_frustum.intersectsSphere(_sphere)) {
      outVisibility[i] = 1;
      visibleCount++;
    } else {
      outVisibility[i] = 0;
    }
  }

  return visibleCount;
}
