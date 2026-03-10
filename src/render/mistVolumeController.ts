import * as THREE from "three";
import type { AppKernel } from "@/app/kernel";
import type { ActorNode, AppState, MistVolumeResource } from "@/core/types";
import { curveDataWithOverrides, getCurveSamplesPerSegmentFromActor } from "@/features/curves/model";

export type MistVolumeQualityMode = "interactive" | "export";
type MistPreviewMode = "volume" | "bounds" | "slice-x" | "slice-y" | "slice-z" | "off";
type MistDebugOverlayMode = "off" | "numbers" | "density-cells" | "velocity-vectors";
type MistSurfaceMode = "open" | "closed";

interface MistLookupNoiseSettings {
  strength: number;
  scale: number;
  speed: number;
  scroll: THREE.Vector3;
  contrast: number;
  bias: number;
  seed: number;
}

interface MistBoundarySettings {
  negX: MistSurfaceMode;
  posX: MistSurfaceMode;
  negY: MistSurfaceMode;
  posY: MistSurfaceMode;
  negZ: MistSurfaceMode;
  posZ: MistSurfaceMode;
}

interface MistVolumeSourceSample {
  positionLocal: THREE.Vector3;
  directionLocal: THREE.Vector3;
}

interface MistVolumeQualitySettings {
  resolution: [number, number, number];
  simulationSubsteps: number;
  previewRaymarchSteps: number;
  qualityMode: MistVolumeQualityMode;
}

interface MistDebugGridResolution {
  x: number;
  y: number;
  z: number;
}

interface MistDebugSettings {
  overlayMode: MistDebugOverlayMode;
  gridResolution: MistDebugGridResolution;
  valueSize: number;
  hideZeroNumbers: boolean;
  densityThreshold: number;
  vectorScale: number;
  sourceMarkers: boolean;
}

interface MistDebugSamplePoint {
  localPosition: THREE.Vector3;
}

interface MistDebugSampleResult {
  density: number;
  velocity: THREE.Vector3;
}

interface MistVolumeHelpers {
  getActorById(actorId: string): ActorNode | null;
  getActorObject(actorId: string): unknown | null;
  sampleCurveWorldPoint(
    actorId: string,
    t: number
  ): {
    position: [number, number, number];
    tangent: [number, number, number];
  } | null;
}

interface MistVolumeBinding {
  actorId: string;
  actorName: string;
  cubeSize: number;
  volumeMatrixWorld: THREE.Matrix4;
  worldToVolumeLocal: THREE.Matrix4;
  resetSignature: string;
}

interface MistVolumeEntry {
  actorId: string;
  previewGroup: THREE.Group;
  debugGroup: THREE.Group;
  debugLabelGroup: THREE.Group;
  debugDensityPoints: THREE.Points;
  debugVelocityLines: THREE.LineSegments;
  debugSourceLines: THREE.LineSegments;
  volumeMesh: THREE.Mesh;
  boundsMesh: THREE.LineSegments;
  sliceMesh: THREE.Mesh;
  volumeMaterial: THREE.ShaderMaterial;
  sliceMaterial: THREE.ShaderMaterial;
  boundsMaterial: THREE.LineBasicMaterial;
  cpuTexture: THREE.Data3DTexture;
  uploadBytes: Uint8Array;
  density: Float32Array;
  densityScratch: Float32Array;
  velocity: Float32Array;
  velocityScratch: Float32Array;
  count: number;
  resolution: [number, number, number];
  lastSignature: string;
  lastSimTimeSeconds: number | null;
  lastLocalCameraInside: boolean;
  simulationBackend: "cpu" | "gpu-webgl2";
  gpuBackend: MistVolumeGpuBackend | null;
  debugLabelPlaneGeometry: THREE.PlaneGeometry;
  debugLabelTextureCache: Map<string, { texture: THREE.CanvasTexture; aspect: number }>;
}

interface MistVolumeGpuBackend {
  densityTargets: [THREE.WebGL3DRenderTarget, THREE.WebGL3DRenderTarget];
  velocityTargets: [THREE.WebGL3DRenderTarget, THREE.WebGL3DRenderTarget];
  densityIndex: 0 | 1;
  velocityIndex: 0 | 1;
  emitterTexture: THREE.DataTexture;
  emitterData: Float32Array;
  emitterCapacity: number;
  simScene: THREE.Scene;
  simCamera: THREE.OrthographicCamera;
  simQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  materials: {
    densityInject: THREE.ShaderMaterial;
    velocityInject: THREE.ShaderMaterial;
    velocityNoise: THREE.ShaderMaterial;
    velocityDiffuse: THREE.ShaderMaterial;
    densityAdvect: THREE.ShaderMaterial;
    densityDiffuse: THREE.ShaderMaterial;
    densityDecay: THREE.ShaderMaterial;
    velocityFinalize: THREE.ShaderMaterial;
    debugDensitySample: THREE.ShaderMaterial;
    debugVelocitySample: THREE.ShaderMaterial;
  };
  debugSampleTarget: THREE.WebGLRenderTarget | null;
}

interface MistSimPassUniforms {
  uDensityTex: { value: THREE.Data3DTexture | null };
  uVelocityTex: { value: THREE.Data3DTexture | null };
  uEmitterTex: { value: THREE.DataTexture | null };
  uEmitterCount: { value: number };
  uResolution: { value: THREE.Vector3 };
  uDt: { value: number };
  uTime: { value: number };
  uLayerIndex: { value: number };
  uBoundaryNegClosed: { value: THREE.Vector3 };
  uBoundaryPosClosed: { value: THREE.Vector3 };
  uSourceRadius: { value: number };
  uWindVector: { value: THREE.Vector3 };
  uWindNoiseStrength: { value: number };
  uWindNoiseScale: { value: number };
  uWindNoiseSpeed: { value: number };
  uWispiness: { value: number };
  uDiffusion: { value: number };
  uDensityDecay: { value: number };
  uEdgeBreakup: { value: number };
  uBuoyancy: { value: number };
  uVelocityDrag: { value: number };
  uNoiseSeed: { value: number };
}

interface MistCpuSimulationDiagnostics {
  postInjectRange: [number, number] | "n/a";
  postTransportRange: [number, number] | "n/a";
  postFadeRange: [number, number] | "n/a";
}

interface MistGpuSimulationDiagnostics {
  emitterCount: number;
}

function readNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const parsed = Number(value);
  let next = Number.isFinite(parsed) ? parsed : fallback;
  if (min !== undefined) {
    next = Math.max(min, next);
  }
  if (max !== undefined) {
    next = Math.min(max, next);
  }
  return next;
}

function readColor(value: unknown, fallback: string): THREE.Color {
  if (typeof value === "string" && (/^#[0-9a-f]{6}$/i.test(value) || /^#[0-9a-f]{3}$/i.test(value))) {
    return new THREE.Color(value);
  }
  return new THREE.Color(fallback);
}

function parseActorIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return new THREE.Vector3(x, y, z);
    }
  }
  return new THREE.Vector3(...fallback);
}

function readPreviewMode(value: unknown): MistPreviewMode {
  return value === "bounds" || value === "slice-x" || value === "slice-y" || value === "slice-z" || value === "off"
    ? value
    : "volume";
}

function readDebugOverlayMode(value: unknown): MistDebugOverlayMode {
  return value === "numbers" || value === "density-cells" || value === "velocity-vectors" ? value : "off";
}

function roundMs(value: number): number {
  return Number(value.toFixed(3));
}

function readSurfaceMode(value: unknown): MistSurfaceMode {
  return value === "closed" ? "closed" : "open";
}

function readLookupNoiseSettings(actor: Pick<ActorNode, "params">): MistLookupNoiseSettings {
  return {
    strength: clamp01(readNumber(actor.params.lookupNoiseStrength, 0.45, 0, 1)),
    scale: readNumber(actor.params.lookupNoiseScale, 1.6, 0.01),
    speed: readNumber(actor.params.lookupNoiseSpeed, 0.12, 0),
    scroll: readVector3(actor.params.lookupNoiseScroll, [0.03, 0.06, 0.02]),
    contrast: readNumber(actor.params.lookupNoiseContrast, 0.9, 0.1),
    bias: readNumber(actor.params.lookupNoiseBias, 0.08, -1, 1),
    seed: Math.floor(readNumber(actor.params.noiseSeed, 1))
  };
}

function readBoundarySettings(actor: Pick<ActorNode, "params">): MistBoundarySettings {
  return {
    negX: readSurfaceMode(actor.params.surfaceNegXMode),
    posX: readSurfaceMode(actor.params.surfacePosXMode),
    negY: readSurfaceMode(actor.params.surfaceNegYMode),
    posY: readSurfaceMode(actor.params.surfacePosYMode),
    negZ: readSurfaceMode(actor.params.surfaceNegZMode),
    posZ: readSurfaceMode(actor.params.surfacePosZMode)
  };
}

function readDebugSettings(actor: Pick<ActorNode, "params">): MistDebugSettings {
  return {
    overlayMode: readDebugOverlayMode(actor.params.debugOverlayMode),
    gridResolution: {
      x: Math.max(1, Math.floor(readNumber(actor.params.debugGridResolutionX, 6, 1, 32))),
      y: Math.max(1, Math.floor(readNumber(actor.params.debugGridResolutionY, 5, 1, 32))),
      z: Math.max(1, Math.floor(readNumber(actor.params.debugGridResolutionZ, 6, 1, 32)))
    },
    valueSize: readNumber(actor.params.debugValueSize, 0.08, 0.02, 1),
    hideZeroNumbers: actor.params.debugHideZeroNumbers !== false,
    densityThreshold: readNumber(actor.params.debugDensityThreshold, 0.02, 0, 1),
    vectorScale: readNumber(actor.params.debugVectorScale, 0.25, 0.01, 4),
    sourceMarkers: actor.params.debugSourceMarkers === true
  };
}

function isLocalCameraInsideUnitCube(localCamera: THREE.Vector3): boolean {
  return (
    localCamera.x >= -0.5 && localCamera.x <= 0.5 &&
    localCamera.y >= -0.5 && localCamera.y <= 0.5 &&
    localCamera.z >= -0.5 && localCamera.z <= 0.5
  );
}

function buildBoundarySummary(boundaries: MistBoundarySettings): string {
  return [
    `L:${boundaries.negX}`,
    `R:${boundaries.posX}`,
    `B:${boundaries.negY}`,
    `T:${boundaries.posY}`,
    `Bk:${boundaries.negZ}`,
    `F:${boundaries.posZ}`
  ].join(" ");
}

function matrixSignature(matrix: THREE.Matrix4): number[] {
  return matrix.elements.map((value) => Number(value.toFixed(6)));
}

function cellIndex(x: number, y: number, z: number, resolution: [number, number, number]): number {
  return x + resolution[0] * (y + resolution[1] * z);
}

function sampleTrilinear(field: Float32Array, resolution: [number, number, number], x: number, y: number, z: number): number {
  const maxX = resolution[0] - 1;
  const maxY = resolution[1] - 1;
  const maxZ = resolution[2] - 1;
  const fx = Math.max(0, Math.min(maxX, x));
  const fy = Math.max(0, Math.min(maxY, y));
  const fz = Math.max(0, Math.min(maxZ, z));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const x1 = Math.min(maxX, x0 + 1);
  const y1 = Math.min(maxY, y0 + 1);
  const z1 = Math.min(maxZ, z0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;

  const c000 = field[cellIndex(x0, y0, z0, resolution)] ?? 0;
  const c100 = field[cellIndex(x1, y0, z0, resolution)] ?? 0;
  const c010 = field[cellIndex(x0, y1, z0, resolution)] ?? 0;
  const c110 = field[cellIndex(x1, y1, z0, resolution)] ?? 0;
  const c001 = field[cellIndex(x0, y0, z1, resolution)] ?? 0;
  const c101 = field[cellIndex(x1, y0, z1, resolution)] ?? 0;
  const c011 = field[cellIndex(x0, y1, z1, resolution)] ?? 0;
  const c111 = field[cellIndex(x1, y1, z1, resolution)] ?? 0;

  const c00 = c000 * (1 - tx) + c100 * tx;
  const c10 = c010 * (1 - tx) + c110 * tx;
  const c01 = c001 * (1 - tx) + c101 * tx;
  const c11 = c011 * (1 - tx) + c111 * tx;
  const c0 = c00 * (1 - ty) + c10 * ty;
  const c1 = c01 * (1 - ty) + c11 * ty;
  return c0 * (1 - tz) + c1 * tz;
}

function sampleVelocityComponentTrilinear(
  field: Float32Array,
  resolution: [number, number, number],
  component: 0 | 1 | 2,
  x: number,
  y: number,
  z: number
): number {
  const maxX = resolution[0] - 1;
  const maxY = resolution[1] - 1;
  const maxZ = resolution[2] - 1;
  const fx = Math.max(0, Math.min(maxX, x));
  const fy = Math.max(0, Math.min(maxY, y));
  const fz = Math.max(0, Math.min(maxZ, z));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const x1 = Math.min(maxX, x0 + 1);
  const y1 = Math.min(maxY, y0 + 1);
  const z1 = Math.min(maxZ, z0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;
  const read = (ix: number, iy: number, iz: number) => field[cellIndex(ix, iy, iz, resolution) * 3 + component] ?? 0;
  const c000 = read(x0, y0, z0);
  const c100 = read(x1, y0, z0);
  const c010 = read(x0, y1, z0);
  const c110 = read(x1, y1, z0);
  const c001 = read(x0, y0, z1);
  const c101 = read(x1, y0, z1);
  const c011 = read(x0, y1, z1);
  const c111 = read(x1, y1, z1);
  const c00 = c000 * (1 - tx) + c100 * tx;
  const c10 = c010 * (1 - tx) + c110 * tx;
  const c01 = c001 * (1 - tx) + c101 * tx;
  const c11 = c011 * (1 - tx) + c111 * tx;
  const c0 = c00 * (1 - ty) + c10 * ty;
  const c1 = c01 * (1 - ty) + c11 * ty;
  return c0 * (1 - tz) + c1 * tz;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothStep01(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function hash4(x: number, y: number, z: number, w: number, seed: number): number {
  const dot =
    x * 127.1 +
    y * 311.7 +
    z * 74.7 +
    w * 19.19 +
    seed * 53.11;
  return fract(Math.sin(dot) * 43758.5453123);
}

function sampleScalarNoise4D(x: number, y: number, z: number, w: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const w0 = Math.floor(w);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const w1 = w0 + 1;
  const tx = smoothStep01(x - x0);
  const ty = smoothStep01(y - y0);
  const tz = smoothStep01(z - z0);
  const tw = smoothStep01(w - w0);

  const v0000 = hash4(x0, y0, z0, w0, seed);
  const v1000 = hash4(x1, y0, z0, w0, seed);
  const v0100 = hash4(x0, y1, z0, w0, seed);
  const v1100 = hash4(x1, y1, z0, w0, seed);
  const v0010 = hash4(x0, y0, z1, w0, seed);
  const v1010 = hash4(x1, y0, z1, w0, seed);
  const v0110 = hash4(x0, y1, z1, w0, seed);
  const v1110 = hash4(x1, y1, z1, w0, seed);
  const v0001 = hash4(x0, y0, z0, w1, seed);
  const v1001 = hash4(x1, y0, z0, w1, seed);
  const v0101 = hash4(x0, y1, z0, w1, seed);
  const v1101 = hash4(x1, y1, z0, w1, seed);
  const v0011 = hash4(x0, y0, z1, w1, seed);
  const v1011 = hash4(x1, y0, z1, w1, seed);
  const v0111 = hash4(x0, y1, z1, w1, seed);
  const v1111 = hash4(x1, y1, z1, w1, seed);

  const x00 = lerp(v0000, v1000, tx);
  const x10 = lerp(v0100, v1100, tx);
  const x20 = lerp(v0010, v1010, tx);
  const x30 = lerp(v0110, v1110, tx);
  const x01 = lerp(v0001, v1001, tx);
  const x11 = lerp(v0101, v1101, tx);
  const x21 = lerp(v0011, v1011, tx);
  const x31 = lerp(v0111, v1111, tx);
  const y00 = lerp(x00, x10, ty);
  const y10 = lerp(x20, x30, ty);
  const y01 = lerp(x01, x11, ty);
  const y11 = lerp(x21, x31, ty);
  const z0v = lerp(y00, y10, tz);
  const z1v = lerp(y01, y11, tz);
  return lerp(z0v, z1v, tw);
}

function sampleVectorNoise4D(
  x: number,
  y: number,
  z: number,
  w: number,
  seed: number,
  scale: number,
  speed: number
): [number, number, number] {
  const sx = x * scale;
  const sy = y * scale;
  const sz = z * scale;
  const sw = w * speed;
  return [
    sampleScalarNoise4D(sx + 11.3, sy + 17.1, sz + 23.7, sw + 3.1, seed * 17 + 1) * 2 - 1,
    sampleScalarNoise4D(sx + 29.5, sy + 31.9, sz + 37.3, sw + 5.7, seed * 17 + 2) * 2 - 1,
    sampleScalarNoise4D(sx + 41.2, sy + 43.8, sz + 47.6, sw + 8.9, seed * 17 + 3) * 2 - 1
  ];
}

function sampleScalarNoiseFromLocalPosition(
  x: number,
  y: number,
  z: number,
  timeSeconds: number,
  seed: number,
  scale: number,
  speed: number
): number {
  return sampleScalarNoise4D(x * scale, y * scale, z * scale, timeSeconds * speed, seed);
}

export function pickMistVolumeQuality(actor: Pick<ActorNode, "params">, qualityMode: MistVolumeQualityMode): MistVolumeQualitySettings {
  const useRender = qualityMode === "export" && actor.params.renderOverrideEnabled === true;
  return {
    resolution: [
      Math.max(4, Math.floor(readNumber(useRender ? actor.params.renderResolutionX : actor.params.resolutionX, 32, 4, 512))),
      Math.max(4, Math.floor(readNumber(useRender ? actor.params.renderResolutionY : actor.params.resolutionY, 24, 4, 512))),
      Math.max(4, Math.floor(readNumber(useRender ? actor.params.renderResolutionZ : actor.params.resolutionZ, 32, 4, 512)))
    ],
    simulationSubsteps: Math.max(1, Math.floor(readNumber(useRender ? actor.params.renderSimulationSubsteps : actor.params.simulationSubsteps, 1, 1, 32))),
    previewRaymarchSteps: Math.max(8, Math.floor(readNumber(useRender ? actor.params.renderPreviewRaymarchSteps : actor.params.previewRaymarchSteps, 48, 8, 512))),
    qualityMode
  };
}

export function canUseGpuMistSimulation(
  renderer: Pick<THREE.WebGLRenderer, "capabilities" | "extensions"> | null
): boolean {
  if (!renderer) {
    return false;
  }
  return renderer.capabilities.isWebGL2 === true && renderer.extensions.has("EXT_color_buffer_float") === true;
}

export function chooseMistSimulationBackend(
  preference: unknown,
  renderer: Pick<THREE.WebGLRenderer, "capabilities" | "extensions"> | null
): "cpu" | "gpu-webgl2" {
  if (preference !== "gpu") {
    return "cpu";
  }
  return canUseGpuMistSimulation(renderer) ? "gpu-webgl2" : "cpu";
}

export function computeMistDensityRange(density: Float32Array): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < density.length; index += 1) {
    const value = density[index] ?? 0;
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 0];
  }
  return [Number(min.toFixed(3)), Number(max.toFixed(3))];
}

export function computeMistDensityFadeFactor(fadeRatePerSecond: number, dtSeconds: number): number {
  return Math.exp(-Math.max(0, fadeRatePerSecond) * Math.max(0, dtSeconds));
}

function uploadMistDensityBytes(density: Float32Array, uploadBytes: Uint8Array): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < density.length; index += 1) {
    const byteValue = Math.round(clamp01(density[index] ?? 0) * 255);
    uploadBytes[index] = byteValue;
    min = Math.min(min, byteValue);
    max = Math.max(max, byteValue);
  }
  return !Number.isFinite(min) || !Number.isFinite(max) ? [0, 0] : [min, max];
}

interface MistInjectionSource {
  positionLocal: THREE.Vector3;
  directionLocal: THREE.Vector3;
}

function injectMistSourcesIntoField(
  density: Float32Array,
  velocity: Float32Array,
  resolution: [number, number, number],
  sources: MistInjectionSource[],
  radiusCells: number,
  densityGain: number,
  initialSpeed: number,
  timeSeconds: number,
  noiseSeed: number,
  emissionNoiseStrength: number,
  emissionNoiseScale: number,
  emissionNoiseSpeed: number
): void {
  for (const source of sources) {
    const [noiseX, noiseY, noiseZ] = emissionNoiseStrength > 1e-4
      ? sampleVectorNoise4D(
        source.positionLocal.x,
        source.positionLocal.y,
        source.positionLocal.z,
        timeSeconds,
        noiseSeed + 11,
        emissionNoiseScale,
        emissionNoiseSpeed
      )
      : [0, 0, 0];
    const emissionNoiseValue = emissionNoiseStrength > 1e-4
      ? sampleScalarNoiseFromLocalPosition(
        source.positionLocal.x + 13.7,
        source.positionLocal.y - 7.1,
        source.positionLocal.z + 3.9,
        timeSeconds,
        noiseSeed + 29,
        emissionNoiseScale,
        emissionNoiseSpeed
      ) * 2 - 1
      : 0;
    const noisyDensityGain = densityGain * Math.max(0, 1 + emissionNoiseValue * emissionNoiseStrength * 0.6);
    const noisyInitialSpeed = initialSpeed * Math.max(0, 1 + emissionNoiseValue * emissionNoiseStrength * 0.35);
    const noisyDirection = emissionNoiseStrength > 1e-4
      ? source.directionLocal.clone().add(new THREE.Vector3(noiseX, noiseY, noiseZ).multiplyScalar(emissionNoiseStrength * 0.45)).normalize()
      : source.directionLocal;
    const cx = ((source.positionLocal.x + 0.5) * (resolution[0] - 1));
    const cy = ((source.positionLocal.y + 0.5) * (resolution[1] - 1));
    const cz = ((source.positionLocal.z + 0.5) * (resolution[2] - 1));
    const minX = Math.max(0, Math.floor(cx - radiusCells));
    const maxX = Math.min(resolution[0] - 1, Math.ceil(cx + radiusCells));
    const minY = Math.max(0, Math.floor(cy - radiusCells));
    const maxY = Math.min(resolution[1] - 1, Math.ceil(cy + radiusCells));
    const minZ = Math.max(0, Math.floor(cz - radiusCells));
    const maxZ = Math.min(resolution[2] - 1, Math.ceil(cz + radiusCells));
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = (x - cx) / Math.max(1, radiusCells);
          const dy = (y - cy) / Math.max(1, radiusCells);
          const dz = (z - cz) / Math.max(1, radiusCells);
          const dist2 = dx * dx + dy * dy + dz * dz;
          if (dist2 > 1) {
            continue;
          }
          const weight = 1 - dist2;
          const index = cellIndex(x, y, z, resolution);
          density[index] = clamp01((density[index] ?? 0) + noisyDensityGain * weight);
          const velocityIndex = index * 3;
          velocity[velocityIndex] = (velocity[velocityIndex] ?? 0) + noisyDirection.x * noisyInitialSpeed * weight;
          velocity[velocityIndex + 1] = (velocity[velocityIndex + 1] ?? 0) + noisyDirection.y * noisyInitialSpeed * weight;
          velocity[velocityIndex + 2] = (velocity[velocityIndex + 2] ?? 0) + noisyDirection.z * noisyInitialSpeed * weight;
        }
      }
    }
  }
}

export function simulateMistCpuInjectionForTest(options?: {
  resolution?: [number, number, number];
  sources?: Array<{ positionLocal: [number, number, number]; directionLocal: [number, number, number] }>;
  radiusCells?: number;
  densityGain?: number;
  initialSpeed?: number;
  timeSeconds?: number;
}): { densityRange: [number, number]; uploadByteRange: [number, number] } {
  const resolution = options?.resolution ?? [8, 8, 8];
  const count = resolution[0] * resolution[1] * resolution[2];
  const density = new Float32Array(count);
  const velocity = new Float32Array(count * 3);
  const uploadBytes = new Uint8Array(count);
  const sources = (options?.sources ?? [
    { positionLocal: [0, 0, 0] as [number, number, number], directionLocal: [0, -1, 0] as [number, number, number] }
  ]).map((source) => ({
    positionLocal: new THREE.Vector3(...source.positionLocal),
    directionLocal: new THREE.Vector3(...source.directionLocal).normalize()
  }));
  injectMistSourcesIntoField(
    density,
    velocity,
    resolution,
    sources,
    options?.radiusCells ?? 2,
    options?.densityGain ?? 0.25,
    options?.initialSpeed ?? 0.6,
    options?.timeSeconds ?? 0,
    1,
    0,
    1,
    0
  );
  const uploadByteRange = uploadMistDensityBytes(density, uploadBytes);
  return {
    densityRange: computeMistDensityRange(density),
    uploadByteRange
  };
}

export function selectMistDensityTexture(
  cpuTexture: THREE.Data3DTexture,
  simulationBackend: "cpu" | "gpu-webgl2",
  gpuBackend: MistVolumeGpuBackend | null
): THREE.Data3DTexture {
  if (simulationBackend === "gpu-webgl2" && gpuBackend) {
    return gpuBackend.densityTargets[gpuBackend.densityIndex].texture;
  }
  return cpuTexture;
}

function createMistSimTarget(
  resolution: [number, number, number]
): THREE.WebGL3DRenderTarget {
  const target = new THREE.WebGL3DRenderTarget(resolution[0], resolution[1], resolution[2], {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false
  });
  target.texture.unpackAlignment = 1;
  return target;
}

function createMistEmitterTexture(capacity: number): { texture: THREE.DataTexture; data: Float32Array } {
  const data = new Float32Array(capacity * 3 * 4);
  const texture = new THREE.DataTexture(data, capacity, 3, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.unpackAlignment = 1;
  return { texture, data };
}

const MIST_SIM_VERTEX_SHADER = `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const MIST_DEBUG_SAMPLE_VERTEX_SHADER = `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const MIST_SIM_COMMON_GLSL = `
  precision highp sampler3D;

  uniform sampler3D uDensityTex;
  uniform sampler3D uVelocityTex;
  uniform sampler2D uEmitterTex;
  uniform int uEmitterCount;
  uniform vec3 uResolution;
  uniform float uDt;
  uniform float uTime;
  uniform float uLayerIndex;
  uniform vec3 uBoundaryNegClosed;
  uniform vec3 uBoundaryPosClosed;
  uniform float uSourceRadius;
  uniform vec3 uWindVector;
  uniform float uWindNoiseStrength;
  uniform float uWindNoiseScale;
  uniform float uWindNoiseSpeed;
  uniform float uWispiness;
  uniform float uDiffusion;
  uniform float uDensityDecay;
  uniform float uEdgeBreakup;
  uniform float uBuoyancy;
  uniform float uVelocityDrag;
  uniform float uNoiseSeed;

  in vec2 vUv;

  float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
  }

  vec3 voxelUVW() {
    return vec3(vUv, (uLayerIndex + 0.5) / max(uResolution.z, 1.0));
  }

  vec3 voxelLocal() {
    return voxelUVW() - vec3(0.5);
  }

  float hash31(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  vec3 grad3(vec3 cell) {
    float x = hash31(cell + vec3(11.3, 0.0, 0.0)) * 2.0 - 1.0;
    float y = hash31(cell + vec3(0.0, 17.1, 0.0)) * 2.0 - 1.0;
    float z = hash31(cell + vec3(0.0, 0.0, 23.7)) * 2.0 - 1.0;
    return normalize(vec3(x, y, z) + vec3(1e-4));
  }

  float gradientNoise3D(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float n000 = dot(grad3(cell + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
    float n100 = dot(grad3(cell + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
    float n010 = dot(grad3(cell + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
    float n110 = dot(grad3(cell + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
    float n001 = dot(grad3(cell + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
    float n101 = dot(grad3(cell + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
    float n011 = dot(grad3(cell + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
    float n111 = dot(grad3(cell + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);
    return mix(nxy0, nxy1, u.z);
  }

  vec3 sampleVectorNoise(vec3 localPosition, float scale, float speed, float seedOffset) {
    vec3 p = localPosition * scale + vec3(uTime * speed);
    return vec3(
      gradientNoise3D(p + vec3(seedOffset + 11.3, 17.1, 23.7)),
      gradientNoise3D(p + vec3(seedOffset + 29.5, 31.9, 37.3)),
      gradientNoise3D(p + vec3(seedOffset + 41.2, 43.8, 47.6))
    );
  }

  vec4 emitterTexel(int emitterIndex, int row) {
    return texelFetch(uEmitterTex, ivec2(emitterIndex, row), 0);
  }

  bool isOpenBoundary(vec3 uvw) {
    return (uvw.x < 0.0 && uBoundaryNegClosed.x < 0.5) ||
      (uvw.x > 1.0 && uBoundaryPosClosed.x < 0.5) ||
      (uvw.y < 0.0 && uBoundaryNegClosed.y < 0.5) ||
      (uvw.y > 1.0 && uBoundaryPosClosed.y < 0.5) ||
      (uvw.z < 0.0 && uBoundaryNegClosed.z < 0.5) ||
      (uvw.z > 1.0 && uBoundaryPosClosed.z < 0.5);
  }

  vec3 clampClosedBoundaryUVW(vec3 uvw) {
    return clamp(uvw, vec3(0.0), vec3(1.0));
  }

  float sampleDensityBoundary(vec3 uvw) {
    if (isOpenBoundary(uvw)) {
      return 0.0;
    }
    return texture(uDensityTex, clampClosedBoundaryUVW(uvw)).r;
  }
`;

const MIST_DEBUG_SAMPLE_COMMON_GLSL = `
  precision highp float;
  precision highp int;
  precision highp sampler3D;

  uniform sampler3D uDensityTex;
  uniform sampler3D uVelocityTex;
  uniform vec3 uGridResolution;
  uniform vec2 uOutputResolution;
  uniform int uPreviewModeCode;
  uniform float uSlicePosition;
  uniform float uMistTimeSeconds;
  uniform float uMistNoiseStrength;
  uniform float uMistNoiseScale;
  uniform float uMistNoiseSpeed;
  uniform vec3 uMistNoiseScroll;
  uniform float uMistNoiseContrast;
  uniform float uMistNoiseBias;
  uniform float uMistNoiseSeed;

  float hash31(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  vec3 grad3(vec3 cell) {
    float x = hash31(cell + vec3(11.3, 0.0, 0.0)) * 2.0 - 1.0;
    float y = hash31(cell + vec3(0.0, 17.1, 0.0)) * 2.0 - 1.0;
    float z = hash31(cell + vec3(0.0, 0.0, 23.7)) * 2.0 - 1.0;
    return normalize(vec3(x, y, z) + vec3(1e-4));
  }

  float gradientNoise3D(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = dot(grad3(cell + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
    float n100 = dot(grad3(cell + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
    float n010 = dot(grad3(cell + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
    float n110 = dot(grad3(cell + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
    float n001 = dot(grad3(cell + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
    float n101 = dot(grad3(cell + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
    float n011 = dot(grad3(cell + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
    float n111 = dot(grad3(cell + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);
    return mix(nxy0, nxy1, u.z);
  }

  float sampleLookupNoise(vec3 localPosition) {
    if (uMistNoiseStrength <= 1e-4) {
      return 1.0;
    }
    vec3 noisePosition =
      (localPosition + vec3(0.5) + uMistNoiseScroll * uMistTimeSeconds * uMistNoiseSpeed)
      * uMistNoiseScale
      + vec3(uMistNoiseSeed * 0.031);
    float noiseA = gradientNoise3D(noisePosition);
    float noiseB = gradientNoise3D(noisePosition * 2.03 + vec3(17.1, -9.4, 5.2));
    float noise = clamp(0.5 + 0.5 * (noiseA * 0.7 + noiseB * 0.3), 0.0, 1.0);
    float contrasted = clamp((noise - 0.5) * uMistNoiseContrast + 0.5 + uMistNoiseBias, 0.0, 1.0);
    return mix(1.0, contrasted, clamp(uMistNoiseStrength, 0.0, 1.0));
  }

  vec3 sampleLocalForIndex(float sampleIndex) {
    float gx = max(uGridResolution.x, 1.0);
    float gy = max(uGridResolution.y, 1.0);
    float gz = max(uGridResolution.z, 1.0);
    if (uPreviewModeCode == 1) {
      float ix = mod(sampleIndex, gx);
      float iy = floor(sampleIndex / gx);
      return vec3(
        gx <= 1.0 ? 0.0 : ix / (gx - 1.0) - 0.5,
        gy <= 1.0 ? 0.0 : iy / (gy - 1.0) - 0.5,
        uSlicePosition - 0.5
      );
    }
    if (uPreviewModeCode == 2) {
      float ix = mod(sampleIndex, gx);
      float iz = floor(sampleIndex / gx);
      return vec3(
        gx <= 1.0 ? 0.0 : ix / (gx - 1.0) - 0.5,
        uSlicePosition - 0.5,
        gz <= 1.0 ? 0.0 : iz / (gz - 1.0) - 0.5
      );
    }
    if (uPreviewModeCode == 3) {
      float iy = mod(sampleIndex, gy);
      float iz = floor(sampleIndex / gy);
      return vec3(
        uSlicePosition - 0.5,
        gy <= 1.0 ? 0.0 : iy / (gy - 1.0) - 0.5,
        gz <= 1.0 ? 0.0 : iz / (gz - 1.0) - 0.5
      );
    }
    float plane = gx * gy;
    float z = floor(sampleIndex / plane);
    float rem = sampleIndex - z * plane;
    float y = floor(rem / gx);
    float x = rem - y * gx;
    return vec3(
      gx <= 1.0 ? 0.0 : x / (gx - 1.0) - 0.5,
      gy <= 1.0 ? 0.0 : y / (gy - 1.0) - 0.5,
      gz <= 1.0 ? 0.0 : z / (gz - 1.0) - 0.5
    );
  }

  float sampleDensityLocal(vec3 localPosition) {
    vec3 uvw = localPosition + vec3(0.5);
    if (uvw.x < 0.0 || uvw.y < 0.0 || uvw.z < 0.0 || uvw.x > 1.0 || uvw.y > 1.0 || uvw.z > 1.0) {
      return 0.0;
    }
    float density = texture(uDensityTex, uvw).r;
    return clamp(density * sampleLookupNoise(localPosition), 0.0, 1.0);
  }
`;

function createMistSimMaterial(fragmentBody: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    uniforms: {
      uDensityTex: { value: null },
      uVelocityTex: { value: null },
      uEmitterTex: { value: null },
      uEmitterCount: { value: 0 },
      uResolution: { value: new THREE.Vector3(1, 1, 1) },
      uDt: { value: 0 },
      uTime: { value: 0 },
      uLayerIndex: { value: 0 },
      uBoundaryNegClosed: { value: new THREE.Vector3() },
      uBoundaryPosClosed: { value: new THREE.Vector3() },
      uSourceRadius: { value: 0.2 },
      uWindVector: { value: new THREE.Vector3() },
      uWindNoiseStrength: { value: 0 },
      uWindNoiseScale: { value: 1 },
      uWindNoiseSpeed: { value: 0 },
      uWispiness: { value: 0 },
      uDiffusion: { value: 0 },
      uDensityDecay: { value: 0 },
      uEdgeBreakup: { value: 0 },
      uBuoyancy: { value: 0 },
      uVelocityDrag: { value: 0 },
      uNoiseSeed: { value: 1 }
    },
    vertexShader: MIST_SIM_VERTEX_SHADER,
    fragmentShader: `
      ${MIST_SIM_COMMON_GLSL}
      out vec4 outColor;
      void main() {
        ${fragmentBody}
      }
    `
  });
}

function createMistDebugSampleMaterial(fragmentBody: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    uniforms: {
      uDensityTex: { value: null },
      uVelocityTex: { value: null },
      uGridResolution: { value: new THREE.Vector3(1, 1, 1) },
      uOutputResolution: { value: new THREE.Vector2(1, 1) },
      uPreviewModeCode: { value: 0 },
      uSlicePosition: { value: 0.5 },
      uMistTimeSeconds: { value: 0 },
      uMistNoiseStrength: { value: 0 },
      uMistNoiseScale: { value: 1 },
      uMistNoiseSpeed: { value: 0 },
      uMistNoiseScroll: { value: new THREE.Vector3() },
      uMistNoiseContrast: { value: 1 },
      uMistNoiseBias: { value: 0 },
      uMistNoiseSeed: { value: 1 }
    },
    vertexShader: MIST_DEBUG_SAMPLE_VERTEX_SHADER,
    fragmentShader: `
      ${MIST_DEBUG_SAMPLE_COMMON_GLSL}
      out vec4 outColor;
      void main() {
        float sampleIndex = floor(gl_FragCoord.x - 0.5) + floor(gl_FragCoord.y - 0.5) * uOutputResolution.x;
        vec3 localPosition = sampleLocalForIndex(sampleIndex);
        ${fragmentBody}
      }
    `
  });
}

function createVolumePreviewMaterial(texture: THREE.Data3DTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uDensityTex: { value: texture },
      uPreviewTint: { value: new THREE.Color("#d9eef7") },
      uOpacityScale: { value: 1.1 },
      uDensityThreshold: { value: 0.02 },
      uRaymarchSteps: { value: 48 },
      uWorldToLocal: { value: new THREE.Matrix4() },
      uMistTimeSeconds: { value: 0 },
      uMistNoiseStrength: { value: 0.45 },
      uMistNoiseScale: { value: 1.6 },
      uMistNoiseSpeed: { value: 0.12 },
      uMistNoiseScroll: { value: new THREE.Vector3(0.03, 0.06, 0.02) },
      uMistNoiseContrast: { value: 0.9 },
      uMistNoiseBias: { value: 0.08 },
      uMistNoiseSeed: { value: 1 }
    },
    vertexShader: `
      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;

      void main() {
        vLocalPosition = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      precision highp sampler3D;

      uniform sampler3D uDensityTex;
      uniform vec3 uPreviewTint;
      uniform float uOpacityScale;
      uniform float uDensityThreshold;
      uniform float uRaymarchSteps;
      uniform mat4 uWorldToLocal;
      uniform float uMistTimeSeconds;
      uniform float uMistNoiseStrength;
      uniform float uMistNoiseScale;
      uniform float uMistNoiseSpeed;
      uniform vec3 uMistNoiseScroll;
      uniform float uMistNoiseContrast;
      uniform float uMistNoiseBias;
      uniform float uMistNoiseSeed;

      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;

      bool intersectBox(vec3 rayOrigin, vec3 rayDir, out float tNear, out float tFar) {
        vec3 boxMin = vec3(-0.5);
        vec3 boxMax = vec3(0.5);
        vec3 invDir = 1.0 / max(abs(rayDir), vec3(1e-5)) * sign(rayDir);
        vec3 t0 = (boxMin - rayOrigin) * invDir;
        vec3 t1 = (boxMax - rayOrigin) * invDir;
        vec3 tMin = min(t0, t1);
        vec3 tMax = max(t0, t1);
        tNear = max(max(tMin.x, tMin.y), tMin.z);
        tFar = min(min(tMax.x, tMax.y), tMax.z);
        return tFar > max(tNear, 0.0);
      }

      float hash31(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      vec3 grad3(vec3 cell) {
        float x = hash31(cell + vec3(11.3, 0.0, 0.0)) * 2.0 - 1.0;
        float y = hash31(cell + vec3(0.0, 17.1, 0.0)) * 2.0 - 1.0;
        float z = hash31(cell + vec3(0.0, 0.0, 23.7)) * 2.0 - 1.0;
        return normalize(vec3(x, y, z) + vec3(1e-4));
      }

      float gradientNoise3D(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);

        float n000 = dot(grad3(cell + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
        float n100 = dot(grad3(cell + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
        float n010 = dot(grad3(cell + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
        float n110 = dot(grad3(cell + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
        float n001 = dot(grad3(cell + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
        float n101 = dot(grad3(cell + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
        float n011 = dot(grad3(cell + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
        float n111 = dot(grad3(cell + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, u.x);
        float nx10 = mix(n010, n110, u.x);
        float nx01 = mix(n001, n101, u.x);
        float nx11 = mix(n011, n111, u.x);
        float nxy0 = mix(nx00, nx10, u.y);
        float nxy1 = mix(nx01, nx11, u.y);
        return mix(nxy0, nxy1, u.z);
      }

      float sampleLookupNoise(vec3 localPosition) {
        if (uMistNoiseStrength <= 1e-4) {
          return 1.0;
        }
        vec3 noisePosition =
          (localPosition + vec3(0.5) + uMistNoiseScroll * uMistTimeSeconds * uMistNoiseSpeed)
          * uMistNoiseScale
          + vec3(uMistNoiseSeed * 0.031);
        float noiseA = gradientNoise3D(noisePosition);
        float noiseB = gradientNoise3D(noisePosition * 2.03 + vec3(17.1, -9.4, 5.2));
        float noise = clamp(0.5 + 0.5 * (noiseA * 0.7 + noiseB * 0.3), 0.0, 1.0);
        float contrasted = clamp((noise - 0.5) * uMistNoiseContrast + 0.5 + uMistNoiseBias, 0.0, 1.0);
        return mix(1.0, contrasted, clamp(uMistNoiseStrength, 0.0, 1.0));
      }

      float sampleMistDensityLocal(vec3 localPosition) {
        vec3 uvw = localPosition + vec3(0.5);
        if (uvw.x < 0.0 || uvw.y < 0.0 || uvw.z < 0.0 || uvw.x > 1.0 || uvw.y > 1.0 || uvw.z > 1.0) {
          return 0.0;
        }
        float density = texture(uDensityTex, uvw).r;
        return clamp(density * sampleLookupNoise(localPosition), 0.0, 1.0);
      }

      void main() {
        vec3 localCamera = (uWorldToLocal * vec4(cameraPosition, 1.0)).xyz;
        vec3 rayOrigin = localCamera;
        vec3 rayDir = normalize((uWorldToLocal * vec4(vWorldPosition, 1.0)).xyz - localCamera);
        float tNear;
        float tFar;
        if (!intersectBox(rayOrigin, rayDir, tNear, tFar)) {
          discard;
        }
        float steps = max(8.0, uRaymarchSteps);
        float dt = max((tFar - max(tNear, 0.0)) / steps, 1e-4);
        vec3 samplePos = rayOrigin + rayDir * max(tNear, 0.0);
        vec3 rgb = vec3(0.0);
        float alpha = 0.0;
        for (float i = 0.0; i < 512.0; i += 1.0) {
          if (i >= steps || alpha >= 0.995) {
            break;
          }
          float density = sampleMistDensityLocal(samplePos);
          if (density > uDensityThreshold) {
            float a = clamp(density * uOpacityScale * dt * 4.0, 0.0, 1.0);
            rgb += (1.0 - alpha) * uPreviewTint * a;
            alpha += (1.0 - alpha) * a;
          }
          samplePos += rayDir * dt;
        }
        if (alpha <= 1e-4) {
          discard;
        }
        gl_FragColor = vec4(rgb, alpha);
      }
    `
  });
}

function createSlicePreviewMaterial(texture: THREE.Data3DTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uDensityTex: { value: texture },
      uDensityGain: { value: 1.1 },
      uSliceAxis: { value: 2 },
      uSlicePosition: { value: 0.5 },
      uMistTimeSeconds: { value: 0 },
      uMistNoiseStrength: { value: 0.45 },
      uMistNoiseScale: { value: 1.6 },
      uMistNoiseSpeed: { value: 0.12 },
      uMistNoiseScroll: { value: new THREE.Vector3(0.03, 0.06, 0.02) },
      uMistNoiseContrast: { value: 0.9 },
      uMistNoiseBias: { value: 0.08 },
      uMistNoiseSeed: { value: 1 }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp sampler3D;

      uniform sampler3D uDensityTex;
      uniform float uDensityGain;
      uniform int uSliceAxis;
      uniform float uSlicePosition;
      uniform float uMistTimeSeconds;
      uniform float uMistNoiseStrength;
      uniform float uMistNoiseScale;
      uniform float uMistNoiseSpeed;
      uniform vec3 uMistNoiseScroll;
      uniform float uMistNoiseContrast;
      uniform float uMistNoiseBias;
      uniform float uMistNoiseSeed;

      varying vec2 vUv;

      float hash31(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      vec3 grad3(vec3 cell) {
        float x = hash31(cell + vec3(11.3, 0.0, 0.0)) * 2.0 - 1.0;
        float y = hash31(cell + vec3(0.0, 17.1, 0.0)) * 2.0 - 1.0;
        float z = hash31(cell + vec3(0.0, 0.0, 23.7)) * 2.0 - 1.0;
        return normalize(vec3(x, y, z) + vec3(1e-4));
      }

      float gradientNoise3D(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        float n000 = dot(grad3(cell + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
        float n100 = dot(grad3(cell + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
        float n010 = dot(grad3(cell + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
        float n110 = dot(grad3(cell + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
        float n001 = dot(grad3(cell + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
        float n101 = dot(grad3(cell + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
        float n011 = dot(grad3(cell + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
        float n111 = dot(grad3(cell + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, u.x);
        float nx10 = mix(n010, n110, u.x);
        float nx01 = mix(n001, n101, u.x);
        float nx11 = mix(n011, n111, u.x);
        float nxy0 = mix(nx00, nx10, u.y);
        float nxy1 = mix(nx01, nx11, u.y);
        return mix(nxy0, nxy1, u.z);
      }

      float sampleLookupNoise(vec3 localPosition) {
        if (uMistNoiseStrength <= 1e-4) {
          return 1.0;
        }
        vec3 noisePosition =
          (localPosition + vec3(0.5) + uMistNoiseScroll * uMistTimeSeconds * uMistNoiseSpeed)
          * uMistNoiseScale
          + vec3(uMistNoiseSeed * 0.031);
        float noiseA = gradientNoise3D(noisePosition);
        float noiseB = gradientNoise3D(noisePosition * 2.03 + vec3(17.1, -9.4, 5.2));
        float noise = clamp(0.5 + 0.5 * (noiseA * 0.7 + noiseB * 0.3), 0.0, 1.0);
        float contrasted = clamp((noise - 0.5) * uMistNoiseContrast + 0.5 + uMistNoiseBias, 0.0, 1.0);
        return mix(1.0, contrasted, clamp(uMistNoiseStrength, 0.0, 1.0));
      }

      void main() {
        vec3 uvw = vec3(vUv, uSlicePosition);
        if (uSliceAxis == 0) {
          uvw = vec3(uSlicePosition, vUv.x, vUv.y);
        } else if (uSliceAxis == 1) {
          uvw = vec3(vUv.x, uSlicePosition, vUv.y);
        }
        float density = texture(uDensityTex, uvw).r;
        density *= sampleLookupNoise(uvw - vec3(0.5));
        float gray = clamp(density * uDensityGain, 0.0, 1.0);
        gl_FragColor = vec4(vec3(gray), 1.0);
      }
    `
  });
}

function createMistVolumeGpuBackend(resolution: [number, number, number]): MistVolumeGpuBackend {
  const densityTargets: [THREE.WebGL3DRenderTarget, THREE.WebGL3DRenderTarget] = [
    createMistSimTarget(resolution),
    createMistSimTarget(resolution)
  ];
  const velocityTargets: [THREE.WebGL3DRenderTarget, THREE.WebGL3DRenderTarget] = [
    createMistSimTarget(resolution),
    createMistSimTarget(resolution)
  ];
  const emitterCapacity = 256;
  const { texture: emitterTexture, data: emitterData } = createMistEmitterTexture(emitterCapacity);
  const simScene = new THREE.Scene();
  const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const materials = {
    densityInject: createMistSimMaterial(`
      vec3 uvw = voxelUVW();
      vec3 localPosition = uvw - vec3(0.5);
      float density = texture(uDensityTex, uvw).r;
      for (int emitterIndex = 0; emitterIndex < 256; emitterIndex += 1) {
        if (emitterIndex >= uEmitterCount) {
          break;
        }
        vec4 emitterA = emitterTexel(emitterIndex, 0);
        vec4 emitterB = emitterTexel(emitterIndex, 1);
        vec3 delta = (localPosition - emitterA.xyz) / max(emitterA.w, 1e-4);
        float dist2 = dot(delta, delta);
        if (dist2 <= 1.0) {
          density += max(0.0, 1.0 - dist2) * max(emitterB.w, 0.0);
        }
      }
      outColor = vec4(clamp01(density), 0.0, 0.0, 1.0);
    `),
    velocityInject: createMistSimMaterial(`
      vec3 uvw = voxelUVW();
      vec3 localPosition = uvw - vec3(0.5);
      vec3 velocity = texture(uVelocityTex, uvw).xyz;
      for (int emitterIndex = 0; emitterIndex < 256; emitterIndex += 1) {
        if (emitterIndex >= uEmitterCount) {
          break;
        }
        vec4 emitterA = emitterTexel(emitterIndex, 0);
        vec4 emitterB = emitterTexel(emitterIndex, 1);
        vec4 emitterC = emitterTexel(emitterIndex, 2);
        vec3 delta = (localPosition - emitterA.xyz) / max(emitterA.w, 1e-4);
        float dist2 = dot(delta, delta);
        if (dist2 <= 1.0) {
          velocity += emitterB.xyz * max(emitterC.x, 0.0) * max(0.0, 1.0 - dist2);
        }
      }
      outColor = vec4(velocity, 1.0);
    `),
    velocityNoise: createMistSimMaterial(`
      vec3 uvw = voxelUVW();
      vec3 localPosition = uvw - vec3(0.5);
      vec3 velocity = texture(uVelocityTex, uvw).xyz;
      float densityInfluence = clamp01(texture(uDensityTex, uvw).r * 1.8);
      if (densityInfluence > 1e-4) {
        velocity += uWindVector * uDt * densityInfluence;
        if (uWindNoiseStrength > 1e-4) {
          vec3 windNoise = sampleVectorNoise(localPosition + vec3(17.1, -9.4, 5.2), uWindNoiseScale, uWindNoiseSpeed, uNoiseSeed + 101.0);
          velocity += windNoise * uWindNoiseStrength * uDt * densityInfluence;
        }
        if (uWispiness > 1e-4) {
          vec3 wispNoise = sampleVectorNoise(localPosition + vec3(-3.7, 12.8, 19.6), 2.5 + uWispiness * 2.0, 0.45 + uWispiness * 0.15, uNoiseSeed + 211.0);
          velocity += wispNoise * (uWispiness * uDt * densityInfluence * 0.75);
        }
      }
      outColor = vec4(velocity, 1.0);
    `),
    velocityDiffuse: createMistSimMaterial(`
      vec3 uvw = voxelUVW();
      vec3 texel = 1.0 / max(uResolution, vec3(1.0));
      vec3 current = texture(uVelocityTex, uvw).xyz;
      vec3 sum =
        texture(uVelocityTex, clamp(uvw + vec3(texel.x, 0.0, 0.0), vec3(0.0), vec3(1.0))).xyz +
        texture(uVelocityTex, clamp(uvw - vec3(texel.x, 0.0, 0.0), vec3(0.0), vec3(1.0))).xyz +
        texture(uVelocityTex, clamp(uvw + vec3(0.0, texel.y, 0.0), vec3(0.0), vec3(1.0))).xyz +
        texture(uVelocityTex, clamp(uvw - vec3(0.0, texel.y, 0.0), vec3(0.0), vec3(1.0))).xyz +
        texture(uVelocityTex, clamp(uvw + vec3(0.0, 0.0, texel.z), vec3(0.0), vec3(1.0))).xyz +
        texture(uVelocityTex, clamp(uvw - vec3(0.0, 0.0, texel.z), vec3(0.0), vec3(1.0))).xyz;
      float mixAmount = clamp01(uDiffusion * uDt * 8.0);
      vec3 smoothed = sum / 6.0;
      outColor = vec4(mix(current, smoothed, mixAmount), 1.0);
    `),
    densityAdvect: createMistSimMaterial(`
      vec3 uvw = voxelUVW();
      vec3 velocity = texture(uVelocityTex, uvw).xyz;
      vec3 backUVW = uvw - velocity * uDt;
      outColor = vec4(sampleDensityBoundary(backUVW), 0.0, 0.0, 1.0);
    `),
    densityDiffuse: createMistSimMaterial(`
      vec3 uvw = voxelUVW();
      vec3 texel = 1.0 / max(uResolution, vec3(1.0));
      float current = texture(uDensityTex, uvw).r;
      float sum =
        texture(uDensityTex, clamp(uvw + vec3(texel.x, 0.0, 0.0), vec3(0.0), vec3(1.0))).r +
        texture(uDensityTex, clamp(uvw - vec3(texel.x, 0.0, 0.0), vec3(0.0), vec3(1.0))).r +
        texture(uDensityTex, clamp(uvw + vec3(0.0, texel.y, 0.0), vec3(0.0), vec3(1.0))).r +
        texture(uDensityTex, clamp(uvw - vec3(0.0, texel.y, 0.0), vec3(0.0), vec3(1.0))).r +
        texture(uDensityTex, clamp(uvw + vec3(0.0, 0.0, texel.z), vec3(0.0), vec3(1.0))).r +
        texture(uDensityTex, clamp(uvw - vec3(0.0, 0.0, texel.z), vec3(0.0), vec3(1.0))).r;
      float mixAmount = clamp01(uDiffusion * 0.4);
      float smoothed = sum / 6.0;
      outColor = vec4(mix(current, smoothed, mixAmount), 0.0, 0.0, 1.0);
    `),
    densityDecay: createMistSimMaterial(`
      vec3 uvw = voxelUVW();
      vec3 localPosition = uvw - vec3(0.5);
      vec3 texel = 1.0 / max(uResolution, vec3(1.0));
      float current = texture(uDensityTex, uvw).r;
      float nextDensity = current * exp(-max(uDensityDecay, 0.0) * max(uDt, 0.0));
      if (uEdgeBreakup > 1e-4 && current > 1e-4) {
        float neighborAverage = (
          texture(uDensityTex, clamp(uvw + vec3(texel.x, 0.0, 0.0), vec3(0.0), vec3(1.0))).r +
          texture(uDensityTex, clamp(uvw - vec3(texel.x, 0.0, 0.0), vec3(0.0), vec3(1.0))).r +
          texture(uDensityTex, clamp(uvw + vec3(0.0, texel.y, 0.0), vec3(0.0), vec3(1.0))).r +
          texture(uDensityTex, clamp(uvw - vec3(0.0, texel.y, 0.0), vec3(0.0), vec3(1.0))).r +
          texture(uDensityTex, clamp(uvw + vec3(0.0, 0.0, texel.z), vec3(0.0), vec3(1.0))).r +
          texture(uDensityTex, clamp(uvw - vec3(0.0, 0.0, texel.z), vec3(0.0), vec3(1.0))).r
        ) / 6.0;
        float edgeFactor = clamp01(abs(current - neighborAverage) * 8.0 + current * (1.0 - current) * 1.5);
        float breakupNoise = gradientNoise3D(localPosition * 2.8 + vec3(uTime * 0.35) + vec3(uNoiseSeed + 307.0, -8.2, 11.7));
        float extraDecay = max(0.0, breakupNoise) * uEdgeBreakup * edgeFactor * uDt * 0.9;
        nextDensity *= max(0.0, 1.0 - extraDecay);
      }
      outColor = vec4(clamp01(nextDensity), 0.0, 0.0, 1.0);
    `),
    velocityFinalize: createMistSimMaterial(`
      vec3 uvw = voxelUVW();
      vec3 velocity = texture(uVelocityTex, uvw).xyz;
      float density = texture(uDensityTex, uvw).r;
      float dragFactor = max(0.0, 1.0 - uVelocityDrag * uDt);
      velocity *= dragFactor;
      velocity.y = (velocity.y + uBuoyancy * density * uDt) * dragFactor;
      if (uvw.x <= 0.001 && uBoundaryNegClosed.x > 0.5) {
        velocity.x = max(0.0, velocity.x);
      }
      if (uvw.x >= 0.999 && uBoundaryPosClosed.x > 0.5) {
        velocity.x = min(0.0, velocity.x);
      }
      if (uvw.y <= 0.001 && uBoundaryNegClosed.y > 0.5) {
        velocity.y = max(0.0, velocity.y);
      }
      if (uvw.y >= 0.999 && uBoundaryPosClosed.y > 0.5) {
        velocity.y = min(0.0, velocity.y);
      }
      if (uvw.z <= 0.001 && uBoundaryNegClosed.z > 0.5) {
        velocity.z = max(0.0, velocity.z);
      }
      if (uvw.z >= 0.999 && uBoundaryPosClosed.z > 0.5) {
        velocity.z = min(0.0, velocity.z);
      }
      outColor = vec4(velocity, 1.0);
    `),
    debugDensitySample: createMistDebugSampleMaterial(`
      float density = sampleDensityLocal(localPosition);
      outColor = vec4(density, 0.0, 0.0, 1.0);
    `),
    debugVelocitySample: createMistDebugSampleMaterial(`
      vec3 uvw = localPosition + vec3(0.5);
      vec3 velocity = vec3(0.0);
      if (uvw.x >= 0.0 && uvw.y >= 0.0 && uvw.z >= 0.0 && uvw.x <= 1.0 && uvw.y <= 1.0 && uvw.z <= 1.0) {
        velocity = texture(uVelocityTex, uvw).xyz;
      }
      outColor = vec4(velocity, 1.0);
    `)
  };
  const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materials.densityInject);
  simQuad.frustumCulled = false;
  simScene.add(simQuad);
  return {
    densityTargets,
    velocityTargets,
    densityIndex: 0,
    velocityIndex: 0,
    emitterTexture,
    emitterData,
    emitterCapacity,
    simScene,
    simCamera,
    simQuad,
    materials,
    debugSampleTarget: null
  };
}

function disposeMistVolumeGpuBackend(backend: MistVolumeGpuBackend | null): void {
  if (!backend) {
    return;
  }
  backend.densityTargets[0].dispose();
  backend.densityTargets[1].dispose();
  backend.velocityTargets[0].dispose();
  backend.velocityTargets[1].dispose();
  backend.emitterTexture.dispose();
  backend.simQuad.geometry.dispose();
  backend.debugSampleTarget?.dispose();
  for (const material of Object.values(backend.materials)) {
    material.dispose();
  }
}

export class MistVolumeController {
  private readonly entriesByActorId = new Map<string, MistVolumeEntry>();
  private webglRenderer: THREE.WebGLRenderer | null = null;

  public constructor(
    private readonly kernel: AppKernel,
    private readonly helpers: MistVolumeHelpers,
    private readonly qualityMode: MistVolumeQualityMode
  ) {}

  public setWebGlRenderer(renderer: THREE.WebGLRenderer | null): void {
    this.webglRenderer = renderer;
  }

  public syncFromState(state: AppState, simTimeSeconds: number, dtSeconds: number): void {
    const actors = Object.values(state.actors).filter((actor) => actor.actorType === "mist-volume");
    const activeIds = new Set(actors.map((actor) => actor.id));
    for (const actorId of [...this.entriesByActorId.keys()]) {
      if (!activeIds.has(actorId)) {
        this.disposeEntry(actorId);
      }
    }
    for (const actor of actors) {
      this.syncActor(actor, state, simTimeSeconds, dtSeconds);
    }
  }

  public getResource(actorId: string): MistVolumeResource | null {
    const entry = this.entriesByActorId.get(actorId);
    const actor = this.helpers.getActorById(actorId);
    if (!entry || !actor) {
      return null;
    }
    const binding = this.resolveVolumeBinding(actor);
    if (!binding) {
      return null;
    }
    const lookupNoise = readLookupNoiseSettings(actor);
    return {
      densityTexture: this.getActiveDensityTexture(entry),
      worldToLocalElements: [...binding.worldToVolumeLocal.elements],
      resolution: [...entry.resolution] as [number, number, number],
      densityScale: 1,
      lookupNoiseStrength: lookupNoise.strength,
      lookupNoiseScale: lookupNoise.scale,
      lookupNoiseSpeed: lookupNoise.speed,
      lookupNoiseScroll: [lookupNoise.scroll.x, lookupNoise.scroll.y, lookupNoise.scroll.z],
      lookupNoiseContrast: lookupNoise.contrast,
      lookupNoiseBias: lookupNoise.bias,
      lookupNoiseSeed: lookupNoise.seed
    };
  }

  public dispose(): void {
    for (const actorId of [...this.entriesByActorId.keys()]) {
      this.disposeEntry(actorId);
    }
  }

  private syncActor(actor: ActorNode, state: AppState, simTimeSeconds: number, dtSeconds: number): void {
    const actorObject = this.helpers.getActorObject(actor.id);
    if (!(actorObject instanceof THREE.Object3D)) {
      return;
    }
    const quality = pickMistVolumeQuality(actor, this.qualityMode);
    const entry = this.ensureEntry(actor.id, quality.resolution);
    this.syncSimulationBackend(entry, actor);
    if (entry.previewGroup.parent !== actorObject) {
      actorObject.add(entry.previewGroup);
    }
    const updateStart = performance.now();
    const previewMode = readPreviewMode(actor.params.previewMode);
    const simulationBackendPreference =
      actor.params.simulationBackendMode === "cpu" || actor.params.simulationBackendMode === "gpu"
        ? actor.params.simulationBackendMode
        : "auto";
    const binding = this.resolveVolumeBinding(actor);
    const boundarySettings = readBoundarySettings(actor);
    if (!binding) {
      this.setPreviewVisibility(entry, false, previewMode);
      this.kernel.store.getState().actions.setActorStatus(actor.id, {
        values: {
          volumeActorName: "n/a",
          previewResolution: quality.resolution,
          qualityMode: quality.qualityMode,
          simulationBackendPreference,
          simulationBackend: entry.simulationBackend,
          previewMode,
          activeSourceCount: 0,
          densityRange: entry.simulationBackend === "cpu" ? this.computeDensityRange(entry.density) : "gpu",
          densityFadeRate: Number(readNumber(actor.params.densityDecay, 0.08, 0).toFixed(3)),
          outflowEnabled: Object.values(boundarySettings).some((mode) => mode === "open"),
          boundaryModes: buildBoundarySummary(boundarySettings),
          previewVisible: false,
          sourceCollectMs: 0,
          simulationMs: 0,
          uploadMs: 0,
          totalUpdateMs: roundMs(performance.now() - updateStart)
        },
        error: this.buildVolumeBindingError(actor),
        updatedAtIso: new Date().toISOString()
      });
      void state;
      return;
    }

    actorObject.updateWorldMatrix(true, false);
    this.updatePreviewTransform(entry, actorObject, binding.volumeMatrixWorld);
    this.updatePreviewUniforms(entry, actor, quality, binding, simTimeSeconds);
    const signature = JSON.stringify({
      manualResetToken: readNumber(actor.params.simulationResetToken, 0),
      volumeActorId: binding.actorId,
      volumeBinding: binding.resetSignature,
      resolution: quality.resolution,
      qualityMode: quality.qualityMode
    });
    const shouldReset =
      entry.lastSignature !== signature ||
      entry.lastSimTimeSeconds === null ||
      simTimeSeconds + 1e-6 < (entry.lastSimTimeSeconds ?? 0);
    if (shouldReset) {
      entry.density.fill(0);
      entry.densityScratch.fill(0);
      entry.velocity.fill(0);
      entry.velocityScratch.fill(0);
      if (entry.gpuBackend && this.webglRenderer) {
        this.clearGpuBackend(entry.gpuBackend);
      }
      entry.lastSignature = signature;
    }

    const sourceCollectStart = performance.now();
    const sources = this.collectSources(actor, binding);
    const sourceCollectMs = performance.now() - sourceCollectStart;
    const clampedDt = Math.max(0, Math.min(dtSeconds, 1 / 15));
    const simulationStart = performance.now();
    let cpuDiagnostics: MistCpuSimulationDiagnostics = { postInjectRange: "n/a", postTransportRange: "n/a", postFadeRange: "n/a" };
    let gpuDiagnostics: MistGpuSimulationDiagnostics = { emitterCount: 0 };
    if (clampedDt > 0) {
      if (entry.simulationBackend === "gpu-webgl2" && entry.gpuBackend && this.webglRenderer) {
        gpuDiagnostics = this.simulateGpu(entry, actor, sources, simTimeSeconds, clampedDt, quality);
      } else {
        cpuDiagnostics = this.simulate(entry, actor, sources, simTimeSeconds, clampedDt, quality);
      }
    }
    const simulationMs = performance.now() - simulationStart;
    const uploadStart = performance.now();
    let uploadByteRange: [number, number] | "n/a" = "n/a";
    if (entry.simulationBackend === "cpu" && (clampedDt > 0 || shouldReset)) {
      uploadByteRange = this.uploadDensity(entry);
    }
    const uploadMs = performance.now() - uploadStart;
    entry.lastSimTimeSeconds = simTimeSeconds;

    const densityRange = entry.simulationBackend === "cpu" ? this.computeDensityRange(entry.density) : "gpu";
    const previewVisible = this.setPreviewVisibility(entry, actorObject.visible === true, previewMode);
    const debugSettings = readDebugSettings(actor);
    const diagnosticSampleRange = this.computeDiagnosticSampleRange(entry, actor, simTimeSeconds);
    const debugState = this.updateDebugOverlay(
      entry,
      actor,
      binding,
      previewMode,
      readNumber(actor.params.slicePosition, 0.5, 0, 1),
      sources,
      simTimeSeconds,
      previewVisible
    );
    const noiseSeed = Math.floor(readNumber(actor.params.noiseSeed, 1));
    const emissionNoiseStrength = readNumber(actor.params.emissionNoiseStrength, 0, 0);
    const windNoiseStrength = readNumber(actor.params.windNoiseStrength, 0, 0);
    const wispiness = readNumber(actor.params.wispiness, 0, 0);
    const edgeBreakup = readNumber(actor.params.edgeBreakup, 0, 0);
    const lookupNoisePreset =
      typeof actor.params.lookupNoisePreset === "string" && actor.params.lookupNoisePreset.length > 0
        ? actor.params.lookupNoisePreset
        : "cloudy";
    const lookupNoise = readLookupNoiseSettings(actor);
    this.kernel.store.getState().actions.setActorStatus(actor.id, {
      values: {
        volumeActorName: binding.actorName,
        previewResolution: quality.resolution,
        qualityMode: quality.qualityMode,
        simulationBackendPreference,
        simulationBackend: entry.simulationBackend,
        simulationPausedMessage: clampedDt <= 1e-8 ? "Simulation time is paused (dt = 0). Press Play to advance the mist simulation." : null,
        previewMode,
        activeSourceCount: sources.length,
        firstSourceSample: this.buildSourceDiagnostic(sources),
        densityRange,
        densityFadeRate: Number(readNumber(actor.params.densityDecay, 0.08, 0).toFixed(3)),
        outflowEnabled: Object.values(boundarySettings).some((mode) => mode === "open"),
        cpuPostInjectRange: cpuDiagnostics.postInjectRange,
        cpuPostTransportRange: cpuDiagnostics.postTransportRange,
        cpuPostFadeRange: cpuDiagnostics.postFadeRange,
        uploadByteRange,
        gpuEmitterCount: gpuDiagnostics.emitterCount,
        diagnosticSampleRange,
        boundaryModes: buildBoundarySummary(boundarySettings),
        previewVisible,
        debugOverlayMode: debugSettings.overlayMode,
        debugGridResolution: [debugSettings.gridResolution.x, debugSettings.gridResolution.y, debugSettings.gridResolution.z],
        debugDensitySampleRange: debugState.sampleRange,
        debugSourceMarkerCount: debugState.sourceMarkerCount,
        noiseSeed,
        emissionNoiseActive: emissionNoiseStrength > 1e-4,
        windNoiseActive: windNoiseStrength > 1e-4,
        wispiness: Number(wispiness.toFixed(3)),
        edgeBreakup: Number(edgeBreakup.toFixed(3)),
        lookupNoisePreset,
        lookupNoiseActive: lookupNoise.strength > 1e-4,
        sourceCollectMs: roundMs(sourceCollectMs),
        simulationMs: roundMs(simulationMs),
        uploadMs: roundMs(uploadMs),
        totalUpdateMs: roundMs(performance.now() - updateStart)
      },
      updatedAtIso: new Date().toISOString()
    });
    void state;
  }

  private ensureEntry(actorId: string, resolution: [number, number, number]): MistVolumeEntry {
    const existing = this.entriesByActorId.get(actorId);
    if (existing && existing.resolution[0] === resolution[0] && existing.resolution[1] === resolution[1] && existing.resolution[2] === resolution[2]) {
      return existing;
    }
    if (existing) {
      this.disposeEntry(actorId);
    }
    const count = resolution[0] * resolution[1] * resolution[2];
    const uploadBytes = new Uint8Array(count);
    const texture = new THREE.Data3DTexture(uploadBytes, resolution[0], resolution[1], resolution[2]);
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    const volumeMaterial = createVolumePreviewMaterial(texture);
    const sliceMaterial = createSlicePreviewMaterial(texture);
    const boundsMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color("#d9eef7"),
      transparent: true,
      opacity: 0.9
    });
    const volumeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), volumeMaterial);
    volumeMesh.frustumCulled = false;
    volumeMesh.name = "mist-volume-preview-volume";
    const boundsMesh = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), boundsMaterial);
    boundsMesh.frustumCulled = false;
    boundsMesh.name = "mist-volume-preview-bounds";
    const sliceMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sliceMaterial);
    sliceMesh.frustumCulled = false;
    sliceMesh.name = "mist-volume-preview-slice";
    const debugGroup = new THREE.Group();
    debugGroup.name = "mist-volume-debug";
    const debugLabelGroup = new THREE.Group();
    debugLabelGroup.name = "mist-volume-debug-labels";
    const debugDensityPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        size: 0.06,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      })
    );
    debugDensityPoints.frustumCulled = false;
    debugDensityPoints.name = "mist-volume-debug-density";
    const debugVelocityLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#ffcc55"),
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    debugVelocityLines.frustumCulled = false;
    debugVelocityLines.name = "mist-volume-debug-velocity";
    const debugSourceLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#7ce0ff"),
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      })
    );
    debugSourceLines.frustumCulled = false;
    debugSourceLines.name = "mist-volume-debug-sources";
    debugGroup.add(debugLabelGroup, debugDensityPoints, debugVelocityLines, debugSourceLines);
    const previewGroup = new THREE.Group();
    previewGroup.name = "mist-volume-preview";
    previewGroup.matrixAutoUpdate = false;
    previewGroup.add(volumeMesh, boundsMesh, sliceMesh, debugGroup);
    const entry: MistVolumeEntry = {
      actorId,
      previewGroup,
      debugGroup,
      debugLabelGroup,
      debugDensityPoints,
      debugVelocityLines,
      debugSourceLines,
      volumeMesh,
      boundsMesh,
      sliceMesh,
      volumeMaterial,
      sliceMaterial,
      boundsMaterial,
      cpuTexture: texture,
      uploadBytes,
      density: new Float32Array(count),
      densityScratch: new Float32Array(count),
      velocity: new Float32Array(count * 3),
      velocityScratch: new Float32Array(count * 3),
      count,
      resolution: [...resolution] as [number, number, number],
      lastSignature: "",
      lastSimTimeSeconds: null,
      lastLocalCameraInside: false,
      simulationBackend: "cpu",
      gpuBackend: null,
      debugLabelPlaneGeometry: new THREE.PlaneGeometry(1, 1),
      debugLabelTextureCache: new Map()
    };
    this.entriesByActorId.set(actorId, entry);
    return entry;
  }

  private syncSimulationBackend(entry: MistVolumeEntry, actor: ActorNode): void {
    const nextBackend = chooseMistSimulationBackend(actor.params.simulationBackendMode, this.webglRenderer);
    if (nextBackend === "gpu-webgl2") {
      if (!entry.gpuBackend) {
        entry.gpuBackend = createMistVolumeGpuBackend(entry.resolution);
      }
      entry.simulationBackend = "gpu-webgl2";
    } else {
      disposeMistVolumeGpuBackend(entry.gpuBackend);
      entry.gpuBackend = null;
      entry.simulationBackend = "cpu";
    }
  }

  private getActiveDensityTexture(entry: MistVolumeEntry): THREE.Data3DTexture {
    return selectMistDensityTexture(entry.cpuTexture, entry.simulationBackend, entry.gpuBackend);
  }

  private resolveVolumeBinding(actor: ActorNode): MistVolumeBinding | null {
    const volumeActorId = typeof actor.params.volumeActorId === "string" && actor.params.volumeActorId.length > 0 ? actor.params.volumeActorId : null;
    if (!volumeActorId) {
      return null;
    }
    const volumeActor = this.helpers.getActorById(volumeActorId);
    const volumeObject = this.helpers.getActorObject(volumeActorId);
    if (!volumeActor || !(volumeObject instanceof THREE.Object3D) || volumeActor.actorType !== "primitive" || volumeActor.params.shape !== "cube") {
      return null;
    }
    volumeObject.updateWorldMatrix(true, false);
    const cubeSize = Math.max(0.001, readNumber(volumeActor.params.cubeSize, 1, 0.001));
    const volumeMatrixWorld = volumeObject.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(cubeSize, cubeSize, cubeSize));
    return {
      actorId: volumeActor.id,
      actorName: volumeActor.name,
      cubeSize,
      volumeMatrixWorld,
      worldToVolumeLocal: volumeMatrixWorld.clone().invert(),
      resetSignature: JSON.stringify({
        cubeSize,
        matrix: matrixSignature(volumeMatrixWorld)
      })
    };
  }

  private buildVolumeBindingError(actor: ActorNode): string {
    const volumeActorId = typeof actor.params.volumeActorId === "string" && actor.params.volumeActorId.length > 0 ? actor.params.volumeActorId : null;
    if (!volumeActorId) {
      return "Assign a cube primitive actor to Volume Cube.";
    }
    const volumeActor = this.helpers.getActorById(volumeActorId);
    if (!volumeActor) {
      return "The referenced Volume Cube actor could not be found.";
    }
    if (volumeActor.actorType !== "primitive") {
      return "Volume Cube must reference a primitive actor.";
    }
    if (volumeActor.params.shape !== "cube") {
      return "Volume Cube must reference a primitive actor with Shape set to cube.";
    }
    return "The referenced Volume Cube actor is not available for simulation.";
  }

  private updatePreviewTransform(entry: MistVolumeEntry, actorObject: THREE.Object3D, volumeMatrixWorld: THREE.Matrix4): void {
    const previewLocalMatrix = actorObject.matrixWorld.clone().invert().multiply(volumeMatrixWorld);
    entry.previewGroup.matrix.copy(previewLocalMatrix);
    entry.previewGroup.matrixWorldNeedsUpdate = true;
  }

  private updatePreviewUniforms(
    entry: MistVolumeEntry,
    actor: ActorNode,
    quality: MistVolumeQualitySettings,
    binding: MistVolumeBinding,
    simTimeSeconds: number
  ): void {
    const previewTint = readColor(actor.params.previewTint, "#d9eef7");
    const previewMode = readPreviewMode(actor.params.previewMode);
    const slicePosition = readNumber(actor.params.slicePosition, 0.5, 0, 1);
    const lookupNoise = readLookupNoiseSettings(actor);
    const cameraPosition = this.kernel.store.getState().state.camera.position;
    const volumeUniforms = entry.volumeMaterial.uniforms as {
      uDensityTex: { value: THREE.Data3DTexture };
      uPreviewTint: { value: THREE.Color };
      uOpacityScale: { value: number };
      uDensityThreshold: { value: number };
      uRaymarchSteps: { value: number };
      uWorldToLocal: { value: THREE.Matrix4 };
      uMistTimeSeconds: { value: number };
      uMistNoiseStrength: { value: number };
      uMistNoiseScale: { value: number };
      uMistNoiseSpeed: { value: number };
      uMistNoiseScroll: { value: THREE.Vector3 };
      uMistNoiseContrast: { value: number };
      uMistNoiseBias: { value: number };
      uMistNoiseSeed: { value: number };
    };
    volumeUniforms.uDensityTex.value = this.getActiveDensityTexture(entry);
    volumeUniforms.uPreviewTint.value.copy(previewTint);
    volumeUniforms.uOpacityScale.value = readNumber(actor.params.previewOpacity, 1.1, 0, 4);
    volumeUniforms.uDensityThreshold.value = readNumber(actor.params.previewThreshold, 0.02, 0, 1);
    volumeUniforms.uRaymarchSteps.value = quality.previewRaymarchSteps;
    volumeUniforms.uWorldToLocal.value.copy(binding.worldToVolumeLocal);
    volumeUniforms.uMistTimeSeconds.value = simTimeSeconds;
    volumeUniforms.uMistNoiseStrength.value = lookupNoise.strength;
    volumeUniforms.uMistNoiseScale.value = lookupNoise.scale;
    volumeUniforms.uMistNoiseSpeed.value = lookupNoise.speed;
    volumeUniforms.uMistNoiseScroll.value.copy(lookupNoise.scroll);
    volumeUniforms.uMistNoiseContrast.value = lookupNoise.contrast;
    volumeUniforms.uMistNoiseBias.value = lookupNoise.bias;
    volumeUniforms.uMistNoiseSeed.value = lookupNoise.seed;
    const sliceUniforms = entry.sliceMaterial.uniforms as {
      uDensityTex: { value: THREE.Data3DTexture };
      uDensityGain: { value: number };
      uSliceAxis: { value: number };
      uSlicePosition: { value: number };
      uMistTimeSeconds: { value: number };
      uMistNoiseStrength: { value: number };
      uMistNoiseScale: { value: number };
      uMistNoiseSpeed: { value: number };
      uMistNoiseScroll: { value: THREE.Vector3 };
      uMistNoiseContrast: { value: number };
      uMistNoiseBias: { value: number };
      uMistNoiseSeed: { value: number };
    };
    sliceUniforms.uDensityTex.value = this.getActiveDensityTexture(entry);
    sliceUniforms.uDensityGain.value = readNumber(actor.params.previewOpacity, 1.1, 0, 8);
    sliceUniforms.uSliceAxis.value = previewMode === "slice-x" ? 0 : previewMode === "slice-y" ? 1 : 2;
    sliceUniforms.uSlicePosition.value = slicePosition;
    sliceUniforms.uMistTimeSeconds.value = simTimeSeconds;
    sliceUniforms.uMistNoiseStrength.value = lookupNoise.strength;
    sliceUniforms.uMistNoiseScale.value = lookupNoise.scale;
    sliceUniforms.uMistNoiseSpeed.value = lookupNoise.speed;
    sliceUniforms.uMistNoiseScroll.value.copy(lookupNoise.scroll);
    sliceUniforms.uMistNoiseContrast.value = lookupNoise.contrast;
    sliceUniforms.uMistNoiseBias.value = lookupNoise.bias;
    sliceUniforms.uMistNoiseSeed.value = lookupNoise.seed;
    entry.boundsMaterial.color.copy(previewTint);
    const localCameraPosition = new THREE.Vector3(
      cameraPosition[0] ?? 0,
      cameraPosition[1] ?? 0,
      cameraPosition[2] ?? 0
    ).applyMatrix4(binding.worldToVolumeLocal);
    entry.lastLocalCameraInside = isLocalCameraInsideUnitCube(localCameraPosition);
    entry.volumeMaterial.side = entry.lastLocalCameraInside ? THREE.BackSide : THREE.FrontSide;
    entry.sliceMesh.position.set(0, 0, 0);
    entry.sliceMesh.rotation.set(0, 0, 0);
    if (previewMode === "slice-x") {
      entry.sliceMesh.position.x = slicePosition - 0.5;
      entry.sliceMesh.rotation.y = Math.PI / 2;
    } else if (previewMode === "slice-y") {
      entry.sliceMesh.position.y = slicePosition - 0.5;
      entry.sliceMesh.rotation.x = -Math.PI / 2;
    } else if (previewMode === "slice-z") {
      entry.sliceMesh.position.z = slicePosition - 0.5;
    }
  }

  private setPreviewVisibility(entry: MistVolumeEntry, actorVisible: boolean, previewMode: MistPreviewMode): boolean {
    const showVolume = actorVisible && previewMode === "volume";
    const showBounds = actorVisible && previewMode === "bounds";
    const showSlice = actorVisible && (previewMode === "slice-x" || previewMode === "slice-y" || previewMode === "slice-z");
    entry.previewGroup.visible = actorVisible && previewMode !== "off";
    entry.volumeMesh.visible = showVolume;
    entry.boundsMesh.visible = showBounds;
    entry.sliceMesh.visible = showSlice;
    return showVolume || showBounds || showSlice;
  }

  private buildDebugSamplePoints(
    previewMode: MistPreviewMode,
    gridResolution: MistDebugGridResolution,
    slicePosition: number
  ): MistDebugSamplePoint[] {
    const points: MistDebugSamplePoint[] = [];
    const range = (count: number) => Array.from({ length: count }, (_, index) => count <= 1 ? 0 : index / (count - 1) - 0.5);
    if (previewMode === "slice-x") {
      for (const y of range(gridResolution.y)) {
        for (const z of range(gridResolution.z)) {
          points.push({
            localPosition: new THREE.Vector3(slicePosition - 0.5, y, z)
          });
        }
      }
      return points;
    }
    if (previewMode === "slice-y") {
      for (const x of range(gridResolution.x)) {
        for (const z of range(gridResolution.z)) {
          points.push({
            localPosition: new THREE.Vector3(x, slicePosition - 0.5, z)
          });
        }
      }
      return points;
    }
    if (previewMode === "slice-z") {
      for (const x of range(gridResolution.x)) {
        for (const y of range(gridResolution.y)) {
          points.push({
            localPosition: new THREE.Vector3(x, y, slicePosition - 0.5)
          });
        }
      }
      return points;
    }
    for (const z of range(gridResolution.z)) {
      for (const y of range(gridResolution.y)) {
        for (const x of range(gridResolution.x)) {
          points.push({
            localPosition: new THREE.Vector3(x, y, z)
          });
        }
      }
    }
    return points;
  }

  private getDebugPreviewModeCode(previewMode: MistPreviewMode): number {
    if (previewMode === "slice-z") {
      return 1;
    }
    if (previewMode === "slice-y") {
      return 2;
    }
    if (previewMode === "slice-x") {
      return 3;
    }
    return 0;
  }

  private ensureDebugSampleTarget(backend: MistVolumeGpuBackend, width: number, height: number): THREE.WebGLRenderTarget {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const existing = backend.debugSampleTarget;
    if (existing && existing.width === safeWidth && existing.height === safeHeight) {
      return existing;
    }
    existing?.dispose();
    const target = new THREE.WebGLRenderTarget(safeWidth, safeHeight, {
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false
    });
    backend.debugSampleTarget = target;
    return target;
  }

  private configureDebugSampleUniforms(
    material: THREE.ShaderMaterial,
    entry: MistVolumeEntry,
    actor: ActorNode,
    previewMode: MistPreviewMode,
    slicePosition: number,
    simTimeSeconds: number,
    outputWidth: number,
    outputHeight: number
  ): void {
    const lookupNoise = readLookupNoiseSettings(actor);
    const debugSettings = readDebugSettings(actor);
    const uniforms = material.uniforms as {
      uDensityTex: { value: THREE.Data3DTexture | null };
      uVelocityTex: { value: THREE.Data3DTexture | null };
      uGridResolution: { value: THREE.Vector3 };
      uOutputResolution: { value: THREE.Vector2 };
      uPreviewModeCode: { value: number };
      uSlicePosition: { value: number };
      uMistTimeSeconds: { value: number };
      uMistNoiseStrength: { value: number };
      uMistNoiseScale: { value: number };
      uMistNoiseSpeed: { value: number };
      uMistNoiseScroll: { value: THREE.Vector3 };
      uMistNoiseContrast: { value: number };
      uMistNoiseBias: { value: number };
      uMistNoiseSeed: { value: number };
    };
    uniforms.uDensityTex.value = this.getActiveDensityTexture(entry);
    uniforms.uVelocityTex.value = entry.simulationBackend === "gpu-webgl2" && entry.gpuBackend
      ? entry.gpuBackend.velocityTargets[entry.gpuBackend.velocityIndex].texture
      : null;
    uniforms.uGridResolution.value.set(
      debugSettings.gridResolution.x,
      debugSettings.gridResolution.y,
      debugSettings.gridResolution.z
    );
    uniforms.uOutputResolution.value.set(outputWidth, outputHeight);
    uniforms.uPreviewModeCode.value = this.getDebugPreviewModeCode(previewMode);
    uniforms.uSlicePosition.value = slicePosition;
    uniforms.uMistTimeSeconds.value = simTimeSeconds;
    uniforms.uMistNoiseStrength.value = lookupNoise.strength;
    uniforms.uMistNoiseScale.value = lookupNoise.scale;
    uniforms.uMistNoiseSpeed.value = lookupNoise.speed;
    uniforms.uMistNoiseScroll.value.copy(lookupNoise.scroll);
    uniforms.uMistNoiseContrast.value = lookupNoise.contrast;
    uniforms.uMistNoiseBias.value = lookupNoise.bias;
    uniforms.uMistNoiseSeed.value = lookupNoise.seed;
  }

  private renderDebugSamplePass(
    backend: MistVolumeGpuBackend,
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget
  ): Float32Array {
    if (!this.webglRenderer) {
      return new Float32Array();
    }
    const renderer = this.webglRenderer;
    const currentTarget = renderer.getRenderTarget();
    const currentCubeFace = renderer.getActiveCubeFace();
    const currentMipmapLevel = renderer.getActiveMipmapLevel();
    backend.simQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(backend.simScene, backend.simCamera);
    const buffer = new Float32Array(target.width * target.height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, buffer);
    renderer.setRenderTarget(currentTarget, currentCubeFace, currentMipmapLevel);
    return buffer;
  }

  private sampleCpuDebugResult(
    entry: MistVolumeEntry,
    actor: ActorNode,
    localPosition: THREE.Vector3,
    simTimeSeconds: number
  ): MistDebugSampleResult {
    const resolution = entry.resolution;
    const uvw = localPosition.clone().addScalar(0.5);
    const density = clamp01(
      sampleTrilinear(
        entry.density,
        resolution,
        uvw.x * (resolution[0] - 1),
        uvw.y * (resolution[1] - 1),
        uvw.z * (resolution[2] - 1)
      ) * this.sampleLookupNoiseCpu(actor, localPosition, simTimeSeconds)
    );
    const velocity = new THREE.Vector3(
      sampleVelocityComponentTrilinear(entry.velocity, resolution, 0, uvw.x * (resolution[0] - 1), uvw.y * (resolution[1] - 1), uvw.z * (resolution[2] - 1)),
      sampleVelocityComponentTrilinear(entry.velocity, resolution, 1, uvw.x * (resolution[0] - 1), uvw.y * (resolution[1] - 1), uvw.z * (resolution[2] - 1)),
      sampleVelocityComponentTrilinear(entry.velocity, resolution, 2, uvw.x * (resolution[0] - 1), uvw.y * (resolution[1] - 1), uvw.z * (resolution[2] - 1))
    );
    return { density, velocity };
  }

  private sampleLookupNoiseCpu(actor: ActorNode, localPosition: THREE.Vector3, simTimeSeconds: number): number {
    const lookupNoise = readLookupNoiseSettings(actor);
    if (lookupNoise.strength <= 1e-4) {
      return 1;
    }
    const noisePosition = localPosition.clone()
      .addScalar(0.5)
      .add(lookupNoise.scroll.clone().multiplyScalar(simTimeSeconds * lookupNoise.speed))
      .multiplyScalar(lookupNoise.scale)
      .addScalar(lookupNoise.seed * 0.031);
    const noiseA = sampleScalarNoiseFromLocalPosition(noisePosition.x, noisePosition.y, noisePosition.z, 0, lookupNoise.seed, 1, 1) * 2 - 1;
    const noiseB = sampleScalarNoiseFromLocalPosition(noisePosition.x * 2.03 + 17.1, noisePosition.y * 2.03 - 9.4, noisePosition.z * 2.03 + 5.2, 0, lookupNoise.seed + 17, 1, 1) * 2 - 1;
    const noise = clamp01(0.5 + 0.5 * (noiseA * 0.7 + noiseB * 0.3));
    const contrasted = clamp01((noise - 0.5) * lookupNoise.contrast + 0.5 + lookupNoise.bias);
    return THREE.MathUtils.lerp(1, contrasted, clamp01(lookupNoise.strength));
  }

  private sampleDebugResults(
    entry: MistVolumeEntry,
    actor: ActorNode,
    previewMode: MistPreviewMode,
    slicePosition: number,
    simTimeSeconds: number,
    samplePoints: MistDebugSamplePoint[],
    overlayMode: MistDebugOverlayMode
  ): MistDebugSampleResult[] {
    if (samplePoints.length === 0) {
      return [];
    }
    if (entry.simulationBackend === "gpu-webgl2" && entry.gpuBackend && this.webglRenderer) {
      const backend = entry.gpuBackend;
      const width = Math.min(64, samplePoints.length);
      const height = Math.ceil(samplePoints.length / width);
      const densityTarget = this.ensureDebugSampleTarget(backend, width, height);
      this.configureDebugSampleUniforms(backend.materials.debugDensitySample, entry, actor, previewMode, slicePosition, simTimeSeconds, width, height);
      const densityPixels = this.renderDebugSamplePass(backend, backend.materials.debugDensitySample, densityTarget);
      let velocityPixels: Float32Array | null = null;
      if (overlayMode === "velocity-vectors") {
        this.configureDebugSampleUniforms(backend.materials.debugVelocitySample, entry, actor, previewMode, slicePosition, simTimeSeconds, width, height);
        velocityPixels = this.renderDebugSamplePass(backend, backend.materials.debugVelocitySample, densityTarget);
      }
      return samplePoints.map((_, index) => {
        const base = index * 4;
        return {
          density: densityPixels[base] ?? 0,
          velocity: new THREE.Vector3(
            velocityPixels?.[base] ?? 0,
            velocityPixels?.[base + 1] ?? 0,
            velocityPixels?.[base + 2] ?? 0
          )
        };
      });
    }
    return samplePoints.map((point) => this.sampleCpuDebugResult(entry, actor, point.localPosition, simTimeSeconds));
  }

  private computeDiagnosticSampleRange(entry: MistVolumeEntry, actor: ActorNode, simTimeSeconds: number): [number, number] | "n/a" {
    const samplePoints = this.buildDebugSamplePoints("volume", { x: 4, y: 4, z: 4 }, 0.5);
    const sampleResults = this.sampleDebugResults(entry, actor, "volume", 0.5, simTimeSeconds, samplePoints, "density-cells");
    if (sampleResults.length === 0) {
      return "n/a";
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const result of sampleResults) {
      min = Math.min(min, result.density);
      max = Math.max(max, result.density);
    }
    return [Number(min.toFixed(3)), Number(max.toFixed(3))];
  }

  private buildSourceDiagnostic(sources: MistVolumeSourceSample[]): string {
    const firstSource = sources[0];
    if (!firstSource) {
      return "n/a";
    }
    const format = (value: number) => Number(value.toFixed(3));
    return `pos ${format(firstSource.positionLocal.x)}, ${format(firstSource.positionLocal.y)}, ${format(firstSource.positionLocal.z)} | dir ${format(firstSource.directionLocal.x)}, ${format(firstSource.directionLocal.y)}, ${format(firstSource.directionLocal.z)}`;
  }

  private getOrCreateDebugLabelTexture(
    entry: MistVolumeEntry,
    label: string
  ): { texture: THREE.CanvasTexture; aspect: number } {
    const cached = entry.debugLabelTextureCache.get(label);
    if (cached) {
      return cached;
    }
    const measureCanvas = document.createElement("canvas");
    const measureContext = measureCanvas.getContext("2d");
    const fontSize = 96;
    const font = `bold ${fontSize}px monospace`;
    const horizontalPadding = 28;
    const verticalPadding = 16;
    const border = 3;
    const measuredWidth = (() => {
      if (!measureContext) {
        return fontSize * Math.max(1, label.length) * 0.62;
      }
      measureContext.font = font;
      return Math.max(1, measureContext.measureText(label).width);
    })();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(measuredWidth + horizontalPadding * 2 + border * 2);
    canvas.height = Math.ceil(fontSize + verticalPadding * 2 + border * 2);
    const context = canvas.getContext("2d");
    if (!context) {
      const texture = new THREE.CanvasTexture(canvas);
      const fallback = { texture, aspect: canvas.width / Math.max(1, canvas.height) };
      entry.debugLabelTextureCache.set(label, fallback);
      return fallback;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(8, 10, 16, 0.88)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(220, 240, 255, 0.9)";
    context.lineWidth = border;
    context.strokeRect(border / 2, border / 2, canvas.width - border, canvas.height - border);
    context.fillStyle = "#ffffff";
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    const next = {
      texture,
      aspect: canvas.width / Math.max(1, canvas.height)
    };
    entry.debugLabelTextureCache.set(label, next);
    return next;
  }

  private updateDebugOverlay(
    entry: MistVolumeEntry,
    actor: ActorNode,
    binding: MistVolumeBinding,
    previewMode: MistPreviewMode,
    slicePosition: number,
    sources: MistVolumeSourceSample[],
    simTimeSeconds: number,
    previewVisible: boolean
  ): { sampleRange: [number, number] | "n/a"; sourceMarkerCount: number } {
    const debugSettings = readDebugSettings(actor);
    const showPrimaryOverlay = previewVisible && debugSettings.overlayMode !== "off";
    const showSourceMarkers = previewVisible && debugSettings.sourceMarkers;
    entry.debugGroup.visible = showPrimaryOverlay || showSourceMarkers;
    entry.debugLabelGroup.visible = showPrimaryOverlay && debugSettings.overlayMode === "numbers";
    entry.debugDensityPoints.visible = showPrimaryOverlay && debugSettings.overlayMode === "density-cells";
    entry.debugVelocityLines.visible = showPrimaryOverlay && debugSettings.overlayMode === "velocity-vectors";
    entry.debugSourceLines.visible = showSourceMarkers;
    let sampleRange: [number, number] | "n/a" = "n/a";
    if (showPrimaryOverlay) {
      const samplePoints = this.buildDebugSamplePoints(previewMode, debugSettings.gridResolution, slicePosition);
      const sampleResults = this.sampleDebugResults(
        entry,
        actor,
        previewMode,
        slicePosition,
        simTimeSeconds,
        samplePoints,
        debugSettings.overlayMode
      );
      if (sampleResults.length > 0) {
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const result of sampleResults) {
          min = Math.min(min, result.density);
          max = Math.max(max, result.density);
        }
        sampleRange = [Number(min.toFixed(3)), Number(max.toFixed(3))];
      }
      this.rebuildDebugLabels(
        entry,
        binding,
        samplePoints,
        sampleResults,
        debugSettings.valueSize,
        debugSettings.hideZeroNumbers,
        debugSettings.densityThreshold
      );
      this.rebuildDebugDensityPoints(entry, samplePoints, sampleResults, debugSettings);
      this.rebuildDebugVelocityLines(entry, samplePoints, sampleResults, debugSettings);
    } else {
      this.rebuildDebugLabels(
        entry,
        binding,
        [],
        [],
        debugSettings.valueSize,
        debugSettings.hideZeroNumbers,
        debugSettings.densityThreshold
      );
      this.rebuildDebugDensityPoints(entry, [], [], debugSettings);
      this.rebuildDebugVelocityLines(entry, [], [], debugSettings);
    }
    const sourceMarkerCount = showSourceMarkers ? this.rebuildDebugSourceMarkers(entry, sources) : this.rebuildDebugSourceMarkers(entry, []);
    return { sampleRange, sourceMarkerCount };
  }

  private getDebugLabelQuaternion(binding: MistVolumeBinding): THREE.Quaternion {
    const cameraPosition = this.kernel.store.getState().state.camera.position;
    const localCameraPosition = new THREE.Vector3(
      cameraPosition[0] ?? 0,
      cameraPosition[1] ?? 0,
      cameraPosition[2] ?? 0
    ).applyMatrix4(binding.worldToVolumeLocal);
    const faceNormal = new THREE.Vector3(0, 0, 1);
    const absX = Math.abs(localCameraPosition.x);
    const absY = Math.abs(localCameraPosition.y);
    const absZ = Math.abs(localCameraPosition.z);
    if (absX >= absY && absX >= absZ) {
      faceNormal.set(Math.sign(localCameraPosition.x) || 1, 0, 0);
    } else if (absY >= absZ) {
      faceNormal.set(0, Math.sign(localCameraPosition.y) || 1, 0);
    } else {
      faceNormal.set(0, 0, Math.sign(localCameraPosition.z) || 1);
    }
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceNormal);
  }

  private rebuildDebugLabels(
    entry: MistVolumeEntry,
    binding: MistVolumeBinding,
    samplePoints: MistDebugSamplePoint[],
    sampleResults: MistDebugSampleResult[],
    valueSize: number,
    hideZeroNumbers: boolean,
    densityThreshold: number
  ): void {
    for (const child of [...entry.debugLabelGroup.children]) {
      entry.debugLabelGroup.remove(child);
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.dispose();
      }
    }
    const labelQuaternion = this.getDebugLabelQuaternion(binding);
    samplePoints.forEach((samplePoint, index) => {
      const density = sampleResults[index]?.density ?? 0;
      if (hideZeroNumbers && density < densityThreshold) {
        return;
      }
      const labelTexture = this.getOrCreateDebugLabelTexture(entry, density.toPrecision(3));
      const material = new THREE.MeshBasicMaterial({
        map: labelTexture.texture,
        transparent: true,
        depthWrite: false,
        depthTest: false
      });
      const mesh = new THREE.Mesh(entry.debugLabelPlaneGeometry, material);
      mesh.position.copy(samplePoint.localPosition);
      mesh.quaternion.copy(labelQuaternion);
      mesh.scale.set(valueSize * labelTexture.aspect, valueSize, 1);
      mesh.frustumCulled = false;
      entry.debugLabelGroup.add(mesh);
    });
  }

  private rebuildDebugDensityPoints(
    entry: MistVolumeEntry,
    samplePoints: MistDebugSamplePoint[],
    sampleResults: MistDebugSampleResult[],
    debugSettings: MistDebugSettings
  ): void {
    const positions: number[] = [];
    const colors: number[] = [];
    samplePoints.forEach((samplePoint, index) => {
      const density = sampleResults[index]?.density ?? 0;
      if (density < debugSettings.densityThreshold) {
        return;
      }
      positions.push(samplePoint.localPosition.x, samplePoint.localPosition.y, samplePoint.localPosition.z);
      colors.push(density, density, density);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    entry.debugDensityPoints.geometry.dispose();
    entry.debugDensityPoints.geometry = geometry;
    (entry.debugDensityPoints.material as THREE.PointsMaterial).size = debugSettings.valueSize * 0.9;
  }

  private rebuildDebugVelocityLines(
    entry: MistVolumeEntry,
    samplePoints: MistDebugSamplePoint[],
    sampleResults: MistDebugSampleResult[],
    debugSettings: MistDebugSettings
  ): void {
    const positions: number[] = [];
    samplePoints.forEach((samplePoint, index) => {
      const velocity = sampleResults[index]?.velocity ?? new THREE.Vector3();
      if (velocity.lengthSq() <= 1e-8) {
        return;
      }
      const end = samplePoint.localPosition.clone().add(velocity.clone().multiplyScalar(debugSettings.vectorScale));
      positions.push(
        samplePoint.localPosition.x, samplePoint.localPosition.y, samplePoint.localPosition.z,
        end.x, end.y, end.z
      );
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    entry.debugVelocityLines.geometry.dispose();
    entry.debugVelocityLines.geometry = geometry;
  }

  private rebuildDebugSourceMarkers(entry: MistVolumeEntry, sources: MistVolumeSourceSample[]): number {
    const positions: number[] = [];
    for (const source of sources) {
      const end = source.positionLocal.clone().add(source.directionLocal.clone().multiplyScalar(0.08));
      positions.push(
        source.positionLocal.x, source.positionLocal.y, source.positionLocal.z,
        end.x, end.y, end.z
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    entry.debugSourceLines.geometry.dispose();
    entry.debugSourceLines.geometry = geometry;
    return sources.length;
  }

  private collectSources(actor: ActorNode, binding: MistVolumeBinding): MistVolumeSourceSample[] {
    const worldToLocal = binding.worldToVolumeLocal;
    const emissionDirection = readVector3(actor.params.emissionDirection, [0, -1, 0]);
    if (emissionDirection.lengthSq() <= 1e-8) {
      emissionDirection.set(0, -1, 0);
    }
    emissionDirection.normalize();
    const sourceActorIds = parseActorIdList(actor.params.sourceActorIds);
    const samples: MistVolumeSourceSample[] = [];
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    for (const sourceActorId of sourceActorIds) {
      const sourceActor = this.helpers.getActorById(sourceActorId);
      const sourceObject = this.helpers.getActorObject(sourceActorId);
      if (!sourceActor || sourceActor.enabled === false || !(sourceObject instanceof THREE.Object3D)) {
        continue;
      }
      sourceObject.updateWorldMatrix(true, false);
      sourceObject.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
      const directionWorld = emissionDirection.clone().applyQuaternion(worldQuaternion).normalize();
      if (sourceActor.actorType === "empty") {
        samples.push({
          positionLocal: new THREE.Vector3().setFromMatrixPosition(sourceObject.matrixWorld).applyMatrix4(worldToLocal),
          directionLocal: directionWorld.clone().transformDirection(worldToLocal).normalize()
        });
        continue;
      }
      if (sourceActor.actorType !== "curve") {
        continue;
      }
      const curveData = curveDataWithOverrides(sourceActor);
      const pointCount = curveData.kind === "circle" ? 1 : curveData.points.filter((point) => point.enabled !== false).length;
      const segmentCount = curveData.kind === "circle" ? 1 : pointCount < 2 ? 0 : (curveData.closed ? pointCount : pointCount - 1);
      const sampleCount = Math.max(2, getCurveSamplesPerSegmentFromActor(sourceActor) * Math.max(1, segmentCount));
      for (let index = 0; index < sampleCount; index += 1) {
        const t = sampleCount <= 1 ? 0 : index / Math.max(1, sampleCount - 1);
        const sampled = this.helpers.sampleCurveWorldPoint(sourceActor.id, curveData.closed ? t : Math.min(t, 0.999999));
        if (!sampled) {
          continue;
        }
        samples.push({
          positionLocal: new THREE.Vector3(...sampled.position).applyMatrix4(worldToLocal),
          directionLocal: directionWorld.clone().transformDirection(worldToLocal).normalize()
        });
      }
    }
    return samples;
  }

  private clearGpuBackend(backend: MistVolumeGpuBackend): void {
    if (!this.webglRenderer) {
      return;
    }
    const renderer = this.webglRenderer;
    const currentTarget = renderer.getRenderTarget();
    const currentCubeFace = renderer.getActiveCubeFace();
    const currentMipmapLevel = renderer.getActiveMipmapLevel();
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const target of [...backend.densityTargets, ...backend.velocityTargets]) {
      for (let layer = 0; layer < target.depth; layer += 1) {
        renderer.setRenderTarget(target, layer);
        renderer.clear(true, false, false);
      }
    }
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.setRenderTarget(currentTarget, currentCubeFace, currentMipmapLevel);
    backend.densityIndex = 0;
    backend.velocityIndex = 0;
  }

  private uploadGpuEmitters(
    backend: MistVolumeGpuBackend,
    actor: ActorNode,
    sources: MistVolumeSourceSample[],
    simTimeSeconds: number
  ): number {
    const noiseSeed = Math.floor(readNumber(actor.params.noiseSeed, 1));
    const sourceRadius = Math.max(0.01, readNumber(actor.params.sourceRadius, 0.2, 0.01));
    const injectionRate = Math.max(0, readNumber(actor.params.injectionRate, 1, 0));
    const initialSpeed = Math.max(0, readNumber(actor.params.initialSpeed, 0.6, 0));
    const emissionNoiseStrength = readNumber(actor.params.emissionNoiseStrength, 0, 0);
    const emissionNoiseScale = readNumber(actor.params.emissionNoiseScale, 1, 0.01);
    const emissionNoiseSpeed = readNumber(actor.params.emissionNoiseSpeed, 0.75, 0);
    const densityGain = injectionRate;
    backend.emitterData.fill(0);
    const maxEmitters = backend.emitterCapacity;
    const count = Math.min(maxEmitters, sources.length);
    for (let index = 0; index < count; index += 1) {
      const sourceIndex = Math.floor(index * Math.max(1, sources.length) / Math.max(1, count));
      const source = sources[sourceIndex] ?? sources[index];
      if (!source) {
        continue;
      }
      const [noiseX, noiseY, noiseZ] = emissionNoiseStrength > 1e-4
        ? sampleVectorNoise4D(
          source.positionLocal.x,
          source.positionLocal.y,
          source.positionLocal.z,
          simTimeSeconds,
          noiseSeed + 11,
          emissionNoiseScale,
          emissionNoiseSpeed
        )
        : [0, 0, 0];
      const emissionNoiseValue = emissionNoiseStrength > 1e-4
        ? sampleScalarNoiseFromLocalPosition(
          source.positionLocal.x + 13.7,
          source.positionLocal.y - 7.1,
          source.positionLocal.z + 3.9,
          simTimeSeconds,
          noiseSeed + 29,
          emissionNoiseScale,
          emissionNoiseSpeed
        ) * 2 - 1
        : 0;
      const noisyDensityGain = densityGain * Math.max(0, 1 + emissionNoiseValue * emissionNoiseStrength * 0.6);
      const noisyInitialSpeed = initialSpeed * Math.max(0, 1 + emissionNoiseValue * emissionNoiseStrength * 0.35);
      const noisyDirection = emissionNoiseStrength > 1e-4
        ? source.directionLocal.clone().add(new THREE.Vector3(noiseX, noiseY, noiseZ).multiplyScalar(emissionNoiseStrength * 0.45)).normalize()
        : source.directionLocal.clone();
      const base = index * 12;
      backend.emitterData[base] = source.positionLocal.x;
      backend.emitterData[base + 1] = source.positionLocal.y;
      backend.emitterData[base + 2] = source.positionLocal.z;
      backend.emitterData[base + 3] = sourceRadius;
      backend.emitterData[base + 4] = noisyDirection.x;
      backend.emitterData[base + 5] = noisyDirection.y;
      backend.emitterData[base + 6] = noisyDirection.z;
      backend.emitterData[base + 7] = noisyDensityGain;
      backend.emitterData[base + 8] = noisyInitialSpeed;
    }
    backend.emitterTexture.needsUpdate = true;
    return count;
  }

  private configureGpuPassUniforms(
    material: THREE.ShaderMaterial,
    entry: MistVolumeEntry,
    actor: ActorNode,
    emitterCount: number,
    stepDt: number,
    timeSeconds: number,
    boundaries: MistBoundarySettings
  ): void {
    const backend = entry.gpuBackend;
    if (!backend) {
      return;
    }
    const uniforms = material.uniforms as unknown as MistSimPassUniforms;
    uniforms.uDensityTex.value = backend.densityTargets[backend.densityIndex].texture;
    uniforms.uVelocityTex.value = backend.velocityTargets[backend.velocityIndex].texture;
    uniforms.uEmitterTex.value = backend.emitterTexture;
    uniforms.uEmitterCount.value = emitterCount;
    (uniforms.uResolution.value as THREE.Vector3).set(entry.resolution[0], entry.resolution[1], entry.resolution[2]);
    uniforms.uDt.value = stepDt;
    uniforms.uTime.value = timeSeconds;
    (uniforms.uBoundaryNegClosed.value as THREE.Vector3).set(
      boundaries.negX === "closed" ? 1 : 0,
      boundaries.negY === "closed" ? 1 : 0,
      boundaries.negZ === "closed" ? 1 : 0
    );
    (uniforms.uBoundaryPosClosed.value as THREE.Vector3).set(
      boundaries.posX === "closed" ? 1 : 0,
      boundaries.posY === "closed" ? 1 : 0,
      boundaries.posZ === "closed" ? 1 : 0
    );
    uniforms.uSourceRadius.value = Math.max(0.01, readNumber(actor.params.sourceRadius, 0.2, 0.01));
    (uniforms.uWindVector.value as THREE.Vector3).copy(readVector3(actor.params.windVector, [0, 0, 0]));
    uniforms.uWindNoiseStrength.value = readNumber(actor.params.windNoiseStrength, 0, 0);
    uniforms.uWindNoiseScale.value = readNumber(actor.params.windNoiseScale, 0.75, 0.01);
    uniforms.uWindNoiseSpeed.value = readNumber(actor.params.windNoiseSpeed, 0.25, 0);
    uniforms.uWispiness.value = readNumber(actor.params.wispiness, 0, 0);
    uniforms.uDiffusion.value = Math.max(0, readNumber(actor.params.diffusion, 0.04, 0));
    uniforms.uDensityDecay.value = Math.max(0, readNumber(actor.params.densityDecay, 0.08, 0));
    uniforms.uEdgeBreakup.value = readNumber(actor.params.edgeBreakup, 0, 0);
    uniforms.uBuoyancy.value = readNumber(actor.params.buoyancy, 0.35);
    uniforms.uVelocityDrag.value = clamp01(readNumber(actor.params.velocityDrag, 0.12, 0, 1));
    uniforms.uNoiseSeed.value = Math.floor(readNumber(actor.params.noiseSeed, 1));
  }

  private renderGpuPass(
    backend: MistVolumeGpuBackend,
    material: THREE.ShaderMaterial,
    target: THREE.WebGL3DRenderTarget
  ): void {
    if (!this.webglRenderer) {
      return;
    }
    const renderer = this.webglRenderer;
    const currentTarget = renderer.getRenderTarget();
    const currentCubeFace = renderer.getActiveCubeFace();
    const currentMipmapLevel = renderer.getActiveMipmapLevel();
    backend.simQuad.material = material;
    const uniforms = material.uniforms as unknown as MistSimPassUniforms;
    for (let layer = 0; layer < target.depth; layer += 1) {
      uniforms.uLayerIndex.value = layer;
      renderer.setRenderTarget(target, layer);
      renderer.render(backend.simScene, backend.simCamera);
    }
    renderer.setRenderTarget(currentTarget, currentCubeFace, currentMipmapLevel);
  }

  private simulateGpu(
    entry: MistVolumeEntry,
    actor: ActorNode,
    sources: MistVolumeSourceSample[],
    simTimeSeconds: number,
    dtSeconds: number,
    quality: MistVolumeQualitySettings
  ): MistGpuSimulationDiagnostics {
    void quality;
    const backend = entry.gpuBackend;
    if (!backend || !this.webglRenderer) {
      return { emitterCount: 0 };
    }
    const steps = Math.max(1, quality.simulationSubsteps);
    const stepDt = dtSeconds / steps;
    const boundaries = readBoundarySettings(actor);
    let lastEmitterCount = 0;
    for (let step = 0; step < steps; step += 1) {
      const stepTime = simTimeSeconds - dtSeconds + stepDt * (step + 1);
      const emitterCount = this.uploadGpuEmitters(backend, actor, sources, stepTime);
      lastEmitterCount = emitterCount;
      const nextVelocityTarget = backend.velocityTargets[1 - backend.velocityIndex]!;
      const nextDensityTarget = backend.densityTargets[1 - backend.densityIndex]!;
      this.configureGpuPassUniforms(backend.materials.velocityInject, entry, actor, emitterCount, stepDt, stepTime, boundaries);
      this.renderGpuPass(backend, backend.materials.velocityInject, nextVelocityTarget);
      backend.velocityIndex = (1 - backend.velocityIndex) as 0 | 1;

      this.configureGpuPassUniforms(backend.materials.densityInject, entry, actor, emitterCount, stepDt, stepTime, boundaries);
      this.renderGpuPass(backend, backend.materials.densityInject, nextDensityTarget);
      backend.densityIndex = (1 - backend.densityIndex) as 0 | 1;

      const velocityTargetAfterInject = backend.velocityTargets[1 - backend.velocityIndex]!;
      this.configureGpuPassUniforms(backend.materials.velocityNoise, entry, actor, emitterCount, stepDt, stepTime, boundaries);
      this.renderGpuPass(backend, backend.materials.velocityNoise, velocityTargetAfterInject);
      backend.velocityIndex = (1 - backend.velocityIndex) as 0 | 1;

      const velocityTargetAfterNoise = backend.velocityTargets[1 - backend.velocityIndex]!;
      this.configureGpuPassUniforms(backend.materials.velocityDiffuse, entry, actor, emitterCount, stepDt, stepTime, boundaries);
      this.renderGpuPass(backend, backend.materials.velocityDiffuse, velocityTargetAfterNoise);
      backend.velocityIndex = (1 - backend.velocityIndex) as 0 | 1;

      const densityTargetAfterInject = backend.densityTargets[1 - backend.densityIndex]!;
      this.configureGpuPassUniforms(backend.materials.densityAdvect, entry, actor, emitterCount, stepDt, stepTime, boundaries);
      this.renderGpuPass(backend, backend.materials.densityAdvect, densityTargetAfterInject);
      backend.densityIndex = (1 - backend.densityIndex) as 0 | 1;

      const densityTargetAfterAdvect = backend.densityTargets[1 - backend.densityIndex]!;
      this.configureGpuPassUniforms(backend.materials.densityDiffuse, entry, actor, emitterCount, stepDt, stepTime, boundaries);
      this.renderGpuPass(backend, backend.materials.densityDiffuse, densityTargetAfterAdvect);
      backend.densityIndex = (1 - backend.densityIndex) as 0 | 1;

      const densityTargetAfterDiffuse = backend.densityTargets[1 - backend.densityIndex]!;
      this.configureGpuPassUniforms(backend.materials.densityDecay, entry, actor, emitterCount, stepDt, stepTime, boundaries);
      this.renderGpuPass(backend, backend.materials.densityDecay, densityTargetAfterDiffuse);
      backend.densityIndex = (1 - backend.densityIndex) as 0 | 1;

      const velocityTargetAfterDiffuse = backend.velocityTargets[1 - backend.velocityIndex]!;
      this.configureGpuPassUniforms(backend.materials.velocityFinalize, entry, actor, emitterCount, stepDt, stepTime, boundaries);
      this.renderGpuPass(backend, backend.materials.velocityFinalize, velocityTargetAfterDiffuse);
      backend.velocityIndex = (1 - backend.velocityIndex) as 0 | 1;
    }
    return { emitterCount: lastEmitterCount };
  }

  private simulate(
    entry: MistVolumeEntry,
    actor: ActorNode,
    sources: MistVolumeSourceSample[],
    simTimeSeconds: number,
    dtSeconds: number,
    quality: MistVolumeQualitySettings
  ): MistCpuSimulationDiagnostics {
    const steps = Math.max(1, quality.simulationSubsteps);
    const stepDt = dtSeconds / steps;
    const noiseSeed = Math.floor(readNumber(actor.params.noiseSeed, 1));
    const sourceRadius = Math.max(0.01, readNumber(actor.params.sourceRadius, 0.2, 0.01));
    const injectionRate = Math.max(0, readNumber(actor.params.injectionRate, 1, 0));
    const initialSpeed = Math.max(0, readNumber(actor.params.initialSpeed, 0.6, 0));
    const buoyancy = readNumber(actor.params.buoyancy, 0.35);
    const velocityDrag = clamp01(readNumber(actor.params.velocityDrag, 0.12, 0, 1));
    const diffusion = Math.max(0, readNumber(actor.params.diffusion, 0.04, 0));
    const densityDecay = Math.max(0, readNumber(actor.params.densityDecay, 0.08, 0));
    const emissionNoiseStrength = readNumber(actor.params.emissionNoiseStrength, 0, 0);
    const emissionNoiseScale = readNumber(actor.params.emissionNoiseScale, 1, 0.01);
    const emissionNoiseSpeed = readNumber(actor.params.emissionNoiseSpeed, 0.75, 0);
    const windVector = readVector3(actor.params.windVector, [0, 0, 0]);
    const windNoiseStrength = readNumber(actor.params.windNoiseStrength, 0, 0);
    const windNoiseScale = readNumber(actor.params.windNoiseScale, 0.75, 0.01);
    const windNoiseSpeed = readNumber(actor.params.windNoiseSpeed, 0.25, 0);
    const wispiness = readNumber(actor.params.wispiness, 0, 0);
    const edgeBreakup = readNumber(actor.params.edgeBreakup, 0, 0);
    const boundaries = readBoundarySettings(actor);
    const radiusCells = Math.max(
      1,
      Math.ceil(
        sourceRadius *
        Math.max(entry.resolution[0], entry.resolution[1], entry.resolution[2])
      )
      );
    let postInjectRange: [number, number] | "n/a" = "n/a";
    let postTransportRange: [number, number] | "n/a" = "n/a";

    for (let step = 0; step < steps; step += 1) {
      const stepTime = simTimeSeconds - dtSeconds + stepDt * (step + 1);
      this.injectSources(
        entry,
        sources,
        radiusCells,
        injectionRate * stepDt,
        initialSpeed,
        stepTime,
        noiseSeed,
        emissionNoiseStrength,
        emissionNoiseScale,
        emissionNoiseSpeed
      );
      postInjectRange = computeMistDensityRange(entry.density);
      this.applyNoiseForces(entry, stepDt, stepTime, noiseSeed, windVector, windNoiseStrength, windNoiseScale, windNoiseSpeed, wispiness);
      this.diffuseVelocity(entry, diffusion, stepDt);
      this.advectDensity(entry, stepDt, boundaries);
      this.applyDensityDiffusion(entry, diffusion);
      postTransportRange = computeMistDensityRange(entry.density);
      this.applyDecay(entry, densityDecay, stepDt, edgeBreakup, stepTime, noiseSeed);
      this.applyVelocityForces(entry, buoyancy, velocityDrag, stepDt, boundaries);
    }
    return {
      postInjectRange,
      postTransportRange,
      postFadeRange: computeMistDensityRange(entry.density)
    };
  }

  private injectSources(
    entry: MistVolumeEntry,
    sources: MistVolumeSourceSample[],
    radiusCells: number,
    densityGain: number,
    initialSpeed: number,
    timeSeconds: number,
    noiseSeed: number,
    emissionNoiseStrength: number,
    emissionNoiseScale: number,
    emissionNoiseSpeed: number
  ): void {
    injectMistSourcesIntoField(
      entry.density,
      entry.velocity,
      entry.resolution,
      sources,
      radiusCells,
      densityGain,
      initialSpeed,
      timeSeconds,
      noiseSeed,
      emissionNoiseStrength,
      emissionNoiseScale,
      emissionNoiseSpeed
    );
  }

  private applyNoiseForces(
    entry: MistVolumeEntry,
    stepDt: number,
    timeSeconds: number,
    noiseSeed: number,
    windVector: THREE.Vector3,
    windNoiseStrength: number,
    windNoiseScale: number,
    windNoiseSpeed: number,
    wispiness: number
  ): void {
    const hasBaseWind = windVector.lengthSq() > 1e-8;
    const hasWindNoise = windNoiseStrength > 1e-4;
    const hasWispiness = wispiness > 1e-4;
    if (!hasBaseWind && !hasWindNoise && !hasWispiness) {
      return;
    }
    const maxX = Math.max(1, entry.resolution[0] - 1);
    const maxY = Math.max(1, entry.resolution[1] - 1);
    const maxZ = Math.max(1, entry.resolution[2] - 1);
    for (let z = 0; z < entry.resolution[2]; z += 1) {
      for (let y = 0; y < entry.resolution[1]; y += 1) {
        for (let x = 0; x < entry.resolution[0]; x += 1) {
          const index = cellIndex(x, y, z, entry.resolution);
          const density = entry.density[index] ?? 0;
          const densityInfluence = clamp01(density * 1.8);
          if (densityInfluence <= 1e-4) {
            continue;
          }
          const localX = x / maxX - 0.5;
          const localY = y / maxY - 0.5;
          const localZ = z / maxZ - 0.5;
          const velocityIndex = index * 3;
          if (hasBaseWind) {
            entry.velocity[velocityIndex] = (entry.velocity[velocityIndex] ?? 0) + windVector.x * stepDt * densityInfluence;
            entry.velocity[velocityIndex + 1] = (entry.velocity[velocityIndex + 1] ?? 0) + windVector.y * stepDt * densityInfluence;
            entry.velocity[velocityIndex + 2] = (entry.velocity[velocityIndex + 2] ?? 0) + windVector.z * stepDt * densityInfluence;
          }
          if (hasWindNoise) {
            const [windNx, windNy, windNz] = sampleVectorNoise4D(
              localX + 17.1,
              localY - 9.4,
              localZ + 5.2,
              timeSeconds,
              noiseSeed + 101,
              windNoiseScale,
              windNoiseSpeed
            );
            entry.velocity[velocityIndex] = (entry.velocity[velocityIndex] ?? 0) + windNx * windNoiseStrength * stepDt * densityInfluence;
            entry.velocity[velocityIndex + 1] = (entry.velocity[velocityIndex + 1] ?? 0) + windNy * windNoiseStrength * stepDt * densityInfluence;
            entry.velocity[velocityIndex + 2] = (entry.velocity[velocityIndex + 2] ?? 0) + windNz * windNoiseStrength * stepDt * densityInfluence;
          }
          if (hasWispiness) {
            const [wispNx, wispNy, wispNz] = sampleVectorNoise4D(
              localX - 3.7,
              localY + 12.8,
              localZ + 19.6,
              timeSeconds,
              noiseSeed + 211,
              2.5 + wispiness * 2,
              0.45 + wispiness * 0.15
            );
            const wispScale = wispiness * stepDt * densityInfluence * 0.75;
            entry.velocity[velocityIndex] = (entry.velocity[velocityIndex] ?? 0) + wispNx * wispScale;
            entry.velocity[velocityIndex + 1] = (entry.velocity[velocityIndex + 1] ?? 0) + wispNy * wispScale;
            entry.velocity[velocityIndex + 2] = (entry.velocity[velocityIndex + 2] ?? 0) + wispNz * wispScale;
          }
        }
      }
    }
  }

  private diffuseVelocity(entry: MistVolumeEntry, diffusion: number, stepDt: number): void {
    const mixAmount = clamp01(diffusion * stepDt * 8);
    for (let z = 0; z < entry.resolution[2]; z += 1) {
      for (let y = 0; y < entry.resolution[1]; y += 1) {
        for (let x = 0; x < entry.resolution[0]; x += 1) {
          const index = cellIndex(x, y, z, entry.resolution);
          const base = index * 3;
          for (let component = 0 as 0 | 1 | 2; component < 3; component = (component + 1) as 0 | 1 | 2) {
            let sum = 0;
            let count = 0;
            const offsets = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]] as const;
            for (const [ox, oy, oz] of offsets) {
              const nx = x + ox;
              const ny = y + oy;
              const nz = z + oz;
              if (nx < 0 || ny < 0 || nz < 0 || nx >= entry.resolution[0] || ny >= entry.resolution[1] || nz >= entry.resolution[2]) {
                continue;
              }
              sum += entry.velocity[cellIndex(nx, ny, nz, entry.resolution) * 3 + component] ?? 0;
              count += 1;
            }
            const current = entry.velocity[base + component] ?? 0;
            const smoothed = count > 0 ? sum / count : current;
            entry.velocityScratch[base + component] = current * (1 - mixAmount) + smoothed * mixAmount;
          }
        }
      }
    }
    entry.velocity.set(entry.velocityScratch);
  }

  private sampleDensityWithBoundaries(
    entry: MistVolumeEntry,
    boundaries: MistBoundarySettings,
    x: number,
    y: number,
    z: number
  ): number {
    const maxX = entry.resolution[0] - 1;
    const maxY = entry.resolution[1] - 1;
    const maxZ = entry.resolution[2] - 1;
    if ((x < 0 && boundaries.negX === "open") || (x > maxX && boundaries.posX === "open")) {
      return 0;
    }
    if ((y < 0 && boundaries.negY === "open") || (y > maxY && boundaries.posY === "open")) {
      return 0;
    }
    if ((z < 0 && boundaries.negZ === "open") || (z > maxZ && boundaries.posZ === "open")) {
      return 0;
    }
    return sampleTrilinear(
      entry.density,
      entry.resolution,
      Math.max(0, Math.min(maxX, x)),
      Math.max(0, Math.min(maxY, y)),
      Math.max(0, Math.min(maxZ, z))
    );
  }

  private advectDensity(entry: MistVolumeEntry, stepDt: number, boundaries: MistBoundarySettings): void {
    for (let z = 0; z < entry.resolution[2]; z += 1) {
      for (let y = 0; y < entry.resolution[1]; y += 1) {
        for (let x = 0; x < entry.resolution[0]; x += 1) {
          const index = cellIndex(x, y, z, entry.resolution);
          const base = index * 3;
          const vx = entry.velocity[base] ?? 0;
          const vy = entry.velocity[base + 1] ?? 0;
          const vz = entry.velocity[base + 2] ?? 0;
          const backX = x - vx * stepDt * entry.resolution[0];
          const backY = y - vy * stepDt * entry.resolution[1];
          const backZ = z - vz * stepDt * entry.resolution[2];
          entry.densityScratch[index] = this.sampleDensityWithBoundaries(entry, boundaries, backX, backY, backZ);
        }
      }
    }
    entry.density.set(entry.densityScratch);
  }

  private applyDensityDiffusion(entry: MistVolumeEntry, diffusion: number): void {
    const mixAmount = clamp01(diffusion * 0.4);
    if (mixAmount <= 0) {
      return;
    }
    for (let z = 0; z < entry.resolution[2]; z += 1) {
      for (let y = 0; y < entry.resolution[1]; y += 1) {
        for (let x = 0; x < entry.resolution[0]; x += 1) {
          const index = cellIndex(x, y, z, entry.resolution);
          let sum = 0;
          let count = 0;
          const offsets = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]] as const;
          for (const [ox, oy, oz] of offsets) {
            const nx = x + ox;
            const ny = y + oy;
            const nz = z + oz;
            if (nx < 0 || ny < 0 || nz < 0 || nx >= entry.resolution[0] || ny >= entry.resolution[1] || nz >= entry.resolution[2]) {
              continue;
            }
            sum += entry.density[cellIndex(nx, ny, nz, entry.resolution)] ?? 0;
            count += 1;
          }
          const current = entry.density[index] ?? 0;
          const smoothed = count > 0 ? sum / count : current;
          entry.densityScratch[index] = current * (1 - mixAmount) + smoothed * mixAmount;
        }
      }
    }
    entry.density.set(entry.densityScratch);
  }

  private applyDecay(
    entry: MistVolumeEntry,
    densityDecay: number,
    stepDt: number,
    edgeBreakup: number,
    timeSeconds: number,
    noiseSeed: number
  ): void {
    const decayFactor = computeMistDensityFadeFactor(densityDecay, stepDt);
    const maxX = Math.max(1, entry.resolution[0] - 1);
    const maxY = Math.max(1, entry.resolution[1] - 1);
    const maxZ = Math.max(1, entry.resolution[2] - 1);
    for (let index = 0; index < entry.count; index += 1) {
      const current = entry.density[index] ?? 0;
      let next = current * decayFactor;
      if (edgeBreakup > 1e-4 && current > 1e-4) {
        const x = index % entry.resolution[0];
        const yz = Math.floor(index / entry.resolution[0]);
        const y = yz % entry.resolution[1];
        const z = Math.floor(yz / entry.resolution[1]);
        let sum = 0;
        let count = 0;
        const offsets = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]] as const;
        for (const [ox, oy, oz] of offsets) {
          const nx = x + ox;
          const ny = y + oy;
          const nz = z + oz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= entry.resolution[0] || ny >= entry.resolution[1] || nz >= entry.resolution[2]) {
            continue;
          }
          sum += entry.density[cellIndex(nx, ny, nz, entry.resolution)] ?? 0;
          count += 1;
        }
        const neighborAverage = count > 0 ? sum / count : current;
        const edgeFactor = clamp01(Math.abs(current - neighborAverage) * 8 + current * (1 - current) * 1.5);
        const localX = x / maxX - 0.5;
        const localY = y / maxY - 0.5;
        const localZ = z / maxZ - 0.5;
        const breakupNoise =
          sampleScalarNoiseFromLocalPosition(localX + 5.1, localY - 8.2, localZ + 11.7, timeSeconds, noiseSeed + 307, 2.8, 0.35) * 2 - 1;
        const extraDecay = Math.max(0, breakupNoise) * edgeBreakup * edgeFactor * stepDt * 0.9;
        next *= Math.max(0, 1 - extraDecay);
      }
      entry.density[index] = clamp01(next);
    }
  }

  private applyVelocityForces(
    entry: MistVolumeEntry,
    buoyancy: number,
    velocityDrag: number,
    stepDt: number,
    boundaries: MistBoundarySettings
  ): void {
    const dragFactor = Math.max(0, 1 - velocityDrag * stepDt);
    for (let z = 0; z < entry.resolution[2]; z += 1) {
      for (let y = 0; y < entry.resolution[1]; y += 1) {
        for (let x = 0; x < entry.resolution[0]; x += 1) {
          const index = cellIndex(x, y, z, entry.resolution);
          const base = index * 3;
          const density = entry.density[index] ?? 0;
          let vx = (entry.velocity[base] ?? 0) * dragFactor;
          let vy = ((entry.velocity[base + 1] ?? 0) + buoyancy * density * stepDt) * dragFactor;
          let vz = (entry.velocity[base + 2] ?? 0) * dragFactor;
          if (x === 0 && boundaries.negX === "closed") {
            vx = Math.max(0, vx);
          }
          if (x === entry.resolution[0] - 1 && boundaries.posX === "closed") {
            vx = Math.min(0, vx);
          }
          if (y === 0 && boundaries.negY === "closed") {
            vy = Math.max(0, vy);
          }
          if (y === entry.resolution[1] - 1 && boundaries.posY === "closed") {
            vy = Math.min(0, vy);
          }
          if (z === 0 && boundaries.negZ === "closed") {
            vz = Math.max(0, vz);
          }
          if (z === entry.resolution[2] - 1 && boundaries.posZ === "closed") {
            vz = Math.min(0, vz);
          }
          entry.velocity[base] = vx;
          entry.velocity[base + 1] = vy;
          entry.velocity[base + 2] = vz;
        }
      }
    }
  }

  private uploadDensity(entry: MistVolumeEntry): [number, number] {
    const byteRange = uploadMistDensityBytes(entry.density, entry.uploadBytes);
    entry.cpuTexture.needsUpdate = true;
    return byteRange;
  }

  private computeDensityRange(density: Float32Array): [number, number] {
    return computeMistDensityRange(density);
  }

  private disposeEntry(actorId: string): void {
    const entry = this.entriesByActorId.get(actorId);
    if (!entry) {
      return;
    }
    entry.previewGroup.parent?.remove(entry.previewGroup);
    entry.volumeMesh.geometry.dispose();
    entry.boundsMesh.geometry.dispose();
    entry.sliceMesh.geometry.dispose();
    entry.debugDensityPoints.geometry.dispose();
    (entry.debugDensityPoints.material as THREE.PointsMaterial).dispose();
    entry.debugVelocityLines.geometry.dispose();
    (entry.debugVelocityLines.material as THREE.LineBasicMaterial).dispose();
    entry.debugSourceLines.geometry.dispose();
    (entry.debugSourceLines.material as THREE.LineBasicMaterial).dispose();
    entry.debugLabelPlaneGeometry.dispose();
    for (const labelTexture of entry.debugLabelTextureCache.values()) {
      labelTexture.texture.dispose();
    }
    for (const child of [...entry.debugLabelGroup.children]) {
      if (child instanceof THREE.Mesh) {
        const material = child.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.dispose();
        }
      }
    }
    entry.volumeMaterial.dispose();
    entry.sliceMaterial.dispose();
    entry.boundsMaterial.dispose();
    entry.cpuTexture.dispose();
    disposeMistVolumeGpuBackend(entry.gpuBackend);
    this.entriesByActorId.delete(actorId);
  }
}
