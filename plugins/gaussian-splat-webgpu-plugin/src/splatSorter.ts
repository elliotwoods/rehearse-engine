/**
 * CPU-based depth sorting for gaussian splats.
 *
 * Maintains a Uint32Array of indices sorted back-to-front by view-space Z.
 * Only re-sorts when the camera has moved since the last sort.
 */

import * as THREE from "three";

const CAMERA_MOVE_THRESHOLD_POS = 1e-4;   // squared distance
const CAMERA_MOVE_THRESHOLD_QUAT = 1e-4;  // sum of absolute quaternion diffs

export class SplatSorter {
  private readonly positions: Float32Array;
  private readonly count: number;
  private readonly sortedIndices: Uint32Array;

  // Camera snapshot for movement detection
  private lastCameraPosition = new THREE.Vector3();
  private lastCameraQuaternion = new THREE.Quaternion();
  private hasSortedOnce = false;

  // Scratch arrays (allocated once)
  private readonly depths: Float32Array;
  private readonly modelViewMatrix = new THREE.Matrix4();

  constructor(positions: Float32Array, count: number, sortedIndices: Uint32Array) {
    this.positions = positions;
    this.count = count;
    this.sortedIndices = sortedIndices;
    this.depths = new Float32Array(count);
  }

  /**
   * Sort if the camera has moved. Returns true if sort was performed.
   * @param camera The scene camera
   * @param modelWorldMatrix The mesh's matrixWorld (includes parent group transforms)
   */
  update(camera: THREE.Camera, modelWorldMatrix: THREE.Matrix4): boolean {
    if (!this.hasCameraMoved(camera) && this.hasSortedOnce) {
      return false;
    }

    // Compute the full model-view matrix: camera.matrixWorldInverse * mesh.matrixWorld
    this.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, modelWorldMatrix);
    this.performSort();
    this.lastCameraPosition.copy(camera.position);
    this.lastCameraQuaternion.copy(camera.quaternion);
    this.hasSortedOnce = true;
    return true;
  }

  private hasCameraMoved(camera: THREE.Camera): boolean {
    const dp = this.lastCameraPosition.distanceToSquared(camera.position);
    if (dp > CAMERA_MOVE_THRESHOLD_POS) return true;

    // Check quaternion difference
    const dq =
      Math.abs(camera.quaternion.x - this.lastCameraQuaternion.x) +
      Math.abs(camera.quaternion.y - this.lastCameraQuaternion.y) +
      Math.abs(camera.quaternion.z - this.lastCameraQuaternion.z) +
      Math.abs(camera.quaternion.w - this.lastCameraQuaternion.w);
    return dq > CAMERA_MOVE_THRESHOLD_QUAT;
  }

  private performSort(): void {
    const positions = this.positions;
    const depths = this.depths;
    const count = this.count;
    const sortedIndices = this.sortedIndices;

    // Get model-view matrix elements (row 2 = Z axis in view space)
    // Three.js column-major: row i is at elements[i], [i+4], [i+8], [i+12]
    const me = this.modelViewMatrix.elements;
    const m20 = me[2];
    const m21 = me[6];
    const m22 = me[10];
    const m23 = me[14];

    // Compute view-space Z for each splat
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // View-space Z (negative = in front of camera)
      depths[i] = m20 * positions[i3] + m21 * positions[i3 + 1] + m22 * positions[i3 + 2] + m23;
    }

    // Sort indices by depth: back-to-front = ascending order (most negative Z first = furthest)
    // Insertion sort is O(n) for nearly-sorted data (the case after the first sort,
    // since the camera moves incrementally between frames).
    this.insertionSort(sortedIndices, depths, count);
  }

  private insertionSort(indices: Uint32Array, depths: Float32Array, count: number): void {
    // Ascending order: most negative Z (furthest from camera) first = back-to-front
    for (let i = 1; i < count; i++) {
      const idx = indices[i];
      const depth = depths[idx];
      let j = i - 1;
      while (j >= 0 && depths[indices[j]] > depth) {
        indices[j + 1] = indices[j];
        j--;
      }
      indices[j + 1] = idx;
    }
  }
}
