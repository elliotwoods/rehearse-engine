/**
 * GPU Radix Sort for gaussian splats using Three.js TSL compute shaders.
 *
 * 4-pass radix sort with 8-bit digits. Per pass: histogram → prefix sum → scatter.
 * 13 fixed dispatches per frame regardless of splat count (vs O(log²N) for bitonic).
 * No power-of-two padding required.
 *
 * Includes temporal sort coherence: when the camera rotates slowly, skip
 * the 12 histogram/prefix/scatter dispatches and only recompute depths.
 */

import * as THREE from "three";
import { StorageBufferAttribute } from "three/webgpu";
import {
  Fn,
  storage,
  globalId,
  workgroupId,
  uniform,
  float,
  uint,
  If,
  select,
  workgroupArray,
  workgroupBarrier,
  atomicAdd,
  Loop,
} from "three/tsl";

/** Sentinel depth: culled splats sort to the end */
const CULLED_DEPTH = 99999.0;

/** Workgroup size for all radix sort kernels */
const WG_SIZE = 256;

/** Number of radix digits (8-bit → 256 bins) */
const NUM_BINS = 256;

// Camera movement thresholds
const CAMERA_MOVE_THRESHOLD_POS = 1e-4;
const CAMERA_MOVE_THRESHOLD_QUAT = 1e-4;

// Temporal coherence: angular threshold for re-sort (radians)
const ANGLE_THRESHOLD = 0.01; // ~0.57°
const MAX_SKIP_FRAMES = 4;    // sort at least every 5th frame

// Depth quantization range (conservative fixed range)
const DEPTH_MIN = -10000.0;
const DEPTH_MAX = 100000.0;

export class RadixSorter {
  private readonly count: number;
  private readonly numWorkgroups: number;

  // Chunk culling
  readonly chunkVisibilityBuffer: StorageBufferAttribute | null;
  private readonly hasCulling: boolean;

  // Compute nodes
  private readonly depthKeyNode: any;
  private readonly histogramNodeAB: any;
  private readonly prefixSumNodeAB: any;
  private readonly scatterNodeAB: any;
  private readonly histogramNodeBA: any;
  private readonly prefixSumNodeBA: any;
  private readonly scatterNodeBA: any;

  // Uniforms
  private readonly uMvRow2: any;
  private readonly uBitOffset: any;

  // Camera tracking
  private lastCameraPosition = new THREE.Vector3();
  private lastCameraQuaternion = new THREE.Quaternion();
  private lastSortCameraPosition = new THREE.Vector3();
  private lastSortCameraQuaternion = new THREE.Quaternion();
  private hasSortedOnce = false;
  private visibilityDirty = true;
  private framesSinceSort = 0;

  // Scratch matrix
  private readonly modelViewMatrix = new THREE.Matrix4();

  constructor(
    positionsBuffer: StorageBufferAttribute,
    sortedIndicesBuffer: StorageBufferAttribute,
    count: number,
    chunkIdsBuffer?: StorageBufferAttribute,
    numChunks?: number,
    chunkVisibilityBuffer?: StorageBufferAttribute
  ) {
    this.count = count;
    this.numWorkgroups = Math.ceil(count / WG_SIZE);
    const numWG = this.numWorkgroups;

    // Chunk culling setup
    this.hasCulling = !!(chunkIdsBuffer && numChunks && numChunks > 0);
    let chunkIdsStorage: any = null;
    let chunkVisibilityStorage: any = null;
    if (this.hasCulling && chunkIdsBuffer && numChunks && chunkVisibilityBuffer) {
      chunkIdsStorage = storage(chunkIdsBuffer, "uint", count).toReadOnly();
      this.chunkVisibilityBuffer = chunkVisibilityBuffer;
      chunkVisibilityStorage = storage(this.chunkVisibilityBuffer, "uint", numChunks).toReadOnly();
    } else {
      this.chunkVisibilityBuffer = null;
    }

    // Create GPU buffers
    const keysAData = new Uint32Array(count);
    const keysBData = new Uint32Array(count);
    const indicesBData = new Uint32Array(count);
    // Initialize indices
    for (let i = 0; i < count; i++) {
      keysAData[i] = 0;
      indicesBData[i] = i;
    }
    const keysABuffer = new StorageBufferAttribute(keysAData, 1);
    const keysBBuffer = new StorageBufferAttribute(keysBData, 1);
    const indicesBBuffer = new StorageBufferAttribute(indicesBData, 1);

    // Histogram: NUM_BINS * numWG entries
    const histogramSize = NUM_BINS * numWG;
    const histogramData = new Uint32Array(histogramSize);
    const histogramBuffer = new StorageBufferAttribute(histogramData, 1);

    // Storage nodes
    const positionsStorage: any = storage(positionsBuffer, "vec4", count).toReadOnly();
    const keysAStorage: any = storage(keysABuffer, "uint", count);
    const keysBStorage: any = storage(keysBBuffer, "uint", count);
    const indicesAStorage: any = storage(sortedIndicesBuffer, "uint", count);
    const indicesBStorage: any = storage(indicesBBuffer, "uint", count);
    const histogramStorage: any = storage(histogramBuffer, "uint", histogramSize);

    // Uniforms
    this.uMvRow2 = uniform(new THREE.Vector4(0, 0, -1, 0));
    this.uBitOffset = uniform(uint(0));

    const hasCullingFlag = this.hasCulling;
    const uMvRow2 = this.uMvRow2;
    const uBitOffset = this.uBitOffset;

    // -----------------------------------------------------------------------
    // Kernel 1: Depth + Key Compute (1 dispatch per frame)
    // -----------------------------------------------------------------------
    const depthKeyFn = Fn(() => {
      const gid: any = globalId.x;
      If(gid.greaterThanEqual(uint(count)), () => { return; });

      const pos: any = positionsStorage.element(gid).xyz;
      const mvRow2: any = uMvRow2;
      const depth: any = mvRow2.x.mul(pos.x)
        .add(mvRow2.y.mul(pos.y))
        .add(mvRow2.z.mul(pos.z))
        .add(mvRow2.w)
        .toVar("depth");

      // Chunk culling
      if (hasCullingFlag && chunkIdsStorage && chunkVisibilityStorage) {
        const chunkId: any = chunkIdsStorage.element(gid);
        const visible: any = chunkVisibilityStorage.element(chunkId);
        depth.assign(select(visible.equal(uint(1)), depth, float(CULLED_DEPTH)));
      }

      // Quantize float depth to sortable uint32
      // Linear map: [DEPTH_MIN, DEPTH_MAX] → [0, 0xFFFFFFFF]
      const normalized: any = depth.sub(float(DEPTH_MIN))
        .div(float(DEPTH_MAX - DEPTH_MIN))
        .clamp(0.0, 1.0);
      const key: any = normalized.mul(float(4294967295.0)).toUint();

      keysAStorage.element(gid).assign(key);
      indicesAStorage.element(gid).assign(gid);
    });

    this.depthKeyNode = depthKeyFn().compute(count, [WG_SIZE]);

    // -----------------------------------------------------------------------
    // Helper: create histogram + prefix sum + scatter kernels for a direction
    // -----------------------------------------------------------------------
    const createRadixPassNodes = (
      keysRead: any,
      indicesRead: any,
      keysWrite: any,
      indicesWrite: any
    ) => {
      // Histogram kernel
      const histogramFn = Fn(() => {
        const gid: any = globalId.x;
        const wgId: any = workgroupId.x;

        // Local histogram bins (shared memory)
        const localBins: any = workgroupArray("uint", NUM_BINS);

        // Initialize local bins to 0
        const localIdx: any = gid.sub(wgId.mul(uint(WG_SIZE)));
        If(localIdx.lessThan(uint(NUM_BINS)), () => {
          localBins.element(localIdx).assign(uint(0));
        });
        workgroupBarrier();

        // Count digit occurrences
        If(gid.lessThan(uint(count)), () => {
          const key: any = keysRead.element(gid);
          const digit: any = key.shiftRight(uBitOffset).bitAnd(uint(0xFF));
          atomicAdd(localBins.element(digit), uint(1));
        });
        workgroupBarrier();

        // Write local histogram to global
        If(localIdx.lessThan(uint(NUM_BINS)), () => {
          histogramStorage.element(localIdx.mul(uint(numWG)).add(wgId)).assign(
            localBins.element(localIdx)
          );
        });
      });

      // Prefix sum kernel (1 workgroup of 256 threads, each handles one digit bin)
      const prefixSumFn = Fn(() => {
        const digit: any = globalId.x;
        If(digit.greaterThanEqual(uint(NUM_BINS)), () => { return; });

        // Sequential scan across all workgroups for this digit
        const runningSum: any = uint(0).toVar("runningSum");
        const baseIdx: any = digit.mul(uint(numWG));

        Loop(numWG, ({ i }: { i: any }) => {
          const idx: any = baseIdx.add(i);
          const val: any = histogramStorage.element(idx).toVar("histVal");
          histogramStorage.element(idx).assign(runningSum);
          runningSum.addAssign(val);
        });
      });

      // Scatter kernel
      const scatterFn = Fn(() => {
        const gid: any = globalId.x;
        const wgId: any = workgroupId.x;

        // Local counters for intra-workgroup ordering
        const localCounters: any = workgroupArray("uint", NUM_BINS);

        const localIdx: any = gid.sub(wgId.mul(uint(WG_SIZE)));
        If(localIdx.lessThan(uint(NUM_BINS)), () => {
          localCounters.element(localIdx).assign(uint(0));
        });
        workgroupBarrier();

        If(gid.lessThan(uint(count)), () => {
          const key: any = keysRead.element(gid);
          const idx: any = indicesRead.element(gid);
          const digit: any = key.shiftRight(uBitOffset).bitAnd(uint(0xFF));

          // Get intra-workgroup offset via atomic add
          const localOffset: any = uint(0).toVar("localOffset");
          atomicAdd(localCounters.element(digit), uint(1), localOffset);

          // Global offset from prefix sum
          const globalOffset: any = histogramStorage.element(digit.mul(uint(numWG)).add(wgId));

          // Write to output
          const destIdx: any = globalOffset.add(localOffset);
          keysWrite.element(destIdx).assign(key);
          indicesWrite.element(destIdx).assign(idx);
        });
      });

      return {
        histogramNode: histogramFn().compute(count, [WG_SIZE]),
        prefixSumNode: prefixSumFn().compute(NUM_BINS, [NUM_BINS]),
        scatterNode: scatterFn().compute(count, [WG_SIZE]),
      };
    };

    // A→B direction (passes 0, 2)
    const ab = createRadixPassNodes(keysAStorage, indicesAStorage, keysBStorage, indicesBStorage);
    this.histogramNodeAB = ab.histogramNode;
    this.prefixSumNodeAB = ab.prefixSumNode;
    this.scatterNodeAB = ab.scatterNode;

    // B→A direction (passes 1, 3)
    const ba = createRadixPassNodes(keysBStorage, indicesBStorage, keysAStorage, indicesAStorage);
    this.histogramNodeBA = ba.histogramNode;
    this.prefixSumNodeBA = ba.prefixSumNode;
    this.scatterNodeBA = ba.scatterNode;
  }

  /**
   * Update the chunk visibility buffer from CPU-side frustum culling results.
   */
  updateChunkVisibility(visibility: Uint32Array): void {
    if (!this.chunkVisibilityBuffer) return;
    const arr = this.chunkVisibilityBuffer.array as Uint32Array;
    arr.set(visibility);
    this.chunkVisibilityBuffer.needsUpdate = true;
    this.visibilityDirty = true;
  }

  /**
   * Run GPU radix sort if needed. 13 dispatches when sorting, 1 when skipping.
   */
  sort(renderer: any, camera: THREE.Camera, modelWorldMatrix: THREE.Matrix4): void {
    if (typeof renderer.compute !== "function") return;

    const cameraMoved = this.hasCameraMoved(camera);
    if (!cameraMoved && !this.visibilityDirty && this.hasSortedOnce) {
      return; // Camera stationary → skip entirely
    }

    // Compute model-view row 2 for depth calculation
    this.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, modelWorldMatrix);
    const me = this.modelViewMatrix.elements;
    this.uMvRow2.value.set(me[2], me[6], me[10], me[14]);

    // Always recompute depths (1 dispatch — cheap)
    renderer.compute(this.depthKeyNode);

    // Temporal coherence: check if full sort is needed
    this.framesSinceSort++;
    const angleDist = this.angleSinceLastSort(camera);
    const needsSort = !this.hasSortedOnce
      || this.visibilityDirty
      || angleDist > ANGLE_THRESHOLD
      || this.framesSinceSort >= MAX_SKIP_FRAMES;

    if (needsSort) {
      // Full radix sort: 4 passes × 3 dispatches = 12 dispatches
      for (let pass = 0; pass < 4; pass++) {
        const bitOffset = pass * 8;
        this.uBitOffset.value = bitOffset;

        if (pass % 2 === 0) {
          // A→B
          renderer.compute(this.histogramNodeAB);
          renderer.compute(this.prefixSumNodeAB);
          renderer.compute(this.scatterNodeAB);
        } else {
          // B→A
          renderer.compute(this.histogramNodeBA);
          renderer.compute(this.prefixSumNodeBA);
          renderer.compute(this.scatterNodeBA);
        }
      }

      this.framesSinceSort = 0;
      this.lastSortCameraPosition.copy(camera.position);
      this.lastSortCameraQuaternion.copy(camera.quaternion);
    }

    // Save camera snapshot for movement detection
    this.lastCameraPosition.copy(camera.position);
    this.lastCameraQuaternion.copy(camera.quaternion);
    this.hasSortedOnce = true;
    this.visibilityDirty = false;
  }

  private hasCameraMoved(camera: THREE.Camera): boolean {
    const dp = this.lastCameraPosition.distanceToSquared(camera.position);
    if (dp > CAMERA_MOVE_THRESHOLD_POS) return true;
    const dq =
      Math.abs(camera.quaternion.x - this.lastCameraQuaternion.x) +
      Math.abs(camera.quaternion.y - this.lastCameraQuaternion.y) +
      Math.abs(camera.quaternion.z - this.lastCameraQuaternion.z) +
      Math.abs(camera.quaternion.w - this.lastCameraQuaternion.w);
    return dq > CAMERA_MOVE_THRESHOLD_QUAT;
  }

  private angleSinceLastSort(camera: THREE.Camera): number {
    const d = Math.abs(
      camera.quaternion.x * this.lastSortCameraQuaternion.x +
      camera.quaternion.y * this.lastSortCameraQuaternion.y +
      camera.quaternion.z * this.lastSortCameraQuaternion.z +
      camera.quaternion.w * this.lastSortCameraQuaternion.w
    );
    // Clamp to avoid NaN from acos
    return 2 * Math.acos(Math.min(d, 1.0));
  }

  dispose(): void {
    // GPU buffers freed when references are released
  }
}
