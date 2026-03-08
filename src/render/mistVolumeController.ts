import * as THREE from "three";
import type { AppKernel } from "@/app/kernel";
import type { ActorNode, AppState, MistVolumeResource } from "@/core/types";
import { curveDataWithOverrides, getCurveSamplesPerSegmentFromActor } from "@/features/curves/model";

export type MistVolumeQualityMode = "interactive" | "export";
type MistPreviewMode = "volume" | "bounds" | "slice-x" | "slice-y" | "slice-z" | "off";

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
  volumeMesh: THREE.Mesh;
  boundsMesh: THREE.LineSegments;
  sliceMesh: THREE.Mesh;
  volumeMaterial: THREE.ShaderMaterial;
  sliceMaterial: THREE.ShaderMaterial;
  boundsMaterial: THREE.LineBasicMaterial;
  texture: THREE.Data3DTexture;
  uploadBytes: Uint8Array;
  density: Float32Array;
  densityScratch: Float32Array;
  velocity: Float32Array;
  velocityScratch: Float32Array;
  count: number;
  resolution: [number, number, number];
  lastSignature: string;
  lastSimTimeSeconds: number | null;
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

function roundMs(value: number): number {
  return Number(value.toFixed(3));
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

function createVolumePreviewMaterial(texture: THREE.Data3DTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uDensityTex: { value: texture },
      uPreviewTint: { value: new THREE.Color("#d9eef7") },
      uOpacityScale: { value: 1.1 },
      uDensityThreshold: { value: 0.02 },
      uRaymarchSteps: { value: 48 },
      uWorldToLocal: { value: new THREE.Matrix4() }
    },
    vertexShader: `
      varying vec3 vLocalPosition;

      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

      varying vec3 vLocalPosition;

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

      void main() {
        vec3 localCamera = (uWorldToLocal * vec4(cameraPosition, 1.0)).xyz;
        vec3 rayOrigin = localCamera;
        vec3 rayDir = normalize(vLocalPosition - localCamera);
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
          vec3 uvw = samplePos + vec3(0.5);
          float density = texture(uDensityTex, uvw).r;
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
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uDensityTex: { value: texture },
      uPreviewTint: { value: new THREE.Color("#d9eef7") },
      uOpacityScale: { value: 1.1 },
      uDensityThreshold: { value: 0.02 },
      uSliceAxis: { value: 2 },
      uSlicePosition: { value: 0.5 }
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
      uniform vec3 uPreviewTint;
      uniform float uOpacityScale;
      uniform float uDensityThreshold;
      uniform int uSliceAxis;
      uniform float uSlicePosition;

      varying vec2 vUv;

      void main() {
        vec3 uvw = vec3(vUv, uSlicePosition);
        if (uSliceAxis == 0) {
          uvw = vec3(uSlicePosition, vUv.x, vUv.y);
        } else if (uSliceAxis == 1) {
          uvw = vec3(vUv.x, uSlicePosition, vUv.y);
        }
        float density = texture(uDensityTex, uvw).r;
        if (density <= uDensityThreshold) {
          discard;
        }
        float alpha = clamp(density * uOpacityScale, 0.0, 1.0);
        gl_FragColor = vec4(uPreviewTint * alpha, alpha);
      }
    `
  });
}

export class MistVolumeController {
  private readonly entriesByActorId = new Map<string, MistVolumeEntry>();

  public constructor(
    private readonly kernel: AppKernel,
    private readonly helpers: MistVolumeHelpers,
    private readonly qualityMode: MistVolumeQualityMode
  ) {}

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
    return {
      densityTexture: entry.texture,
      worldToLocalElements: [...binding.worldToVolumeLocal.elements],
      resolution: [...entry.resolution] as [number, number, number],
      densityScale: 1
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
    if (entry.previewGroup.parent !== actorObject) {
      actorObject.add(entry.previewGroup);
    }
    const updateStart = performance.now();
    const previewMode = readPreviewMode(actor.params.previewMode);
    const binding = this.resolveVolumeBinding(actor);
    if (!binding) {
      this.setPreviewVisibility(entry, false, previewMode);
      this.kernel.store.getState().actions.setActorStatus(actor.id, {
        values: {
          volumeActorName: "n/a",
          previewResolution: quality.resolution,
          qualityMode: quality.qualityMode,
          previewMode,
          activeSourceCount: 0,
          densityRange: this.computeDensityRange(entry.density),
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
    this.updatePreviewUniforms(entry, actor, quality, binding);
    const signature = JSON.stringify({
      volumeActorId: binding.actorId,
      volumeBinding: binding.resetSignature,
      sourceActorIds: parseActorIdList(actor.params.sourceActorIds),
      emissionDirection: readVector3(actor.params.emissionDirection, [0, -1, 0]).toArray().map((value) => Number(value.toFixed(6))),
      sourceRadius: readNumber(actor.params.sourceRadius, 0.2),
      injectionRate: readNumber(actor.params.injectionRate, 1),
      initialSpeed: readNumber(actor.params.initialSpeed, 0.6),
      buoyancy: readNumber(actor.params.buoyancy, 0.35),
      velocityDrag: readNumber(actor.params.velocityDrag, 0.12),
      diffusion: readNumber(actor.params.diffusion, 0.04),
      densityDecay: readNumber(actor.params.densityDecay, 0.08),
      previewMode,
      previewTint: actor.params.previewTint,
      previewOpacity: actor.params.previewOpacity,
      previewThreshold: actor.params.previewThreshold,
      slicePosition: readNumber(actor.params.slicePosition, 0.5, 0, 1),
      resolution: quality.resolution,
      previewRaymarchSteps: quality.previewRaymarchSteps,
      override: actor.params.renderOverrideEnabled === true,
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
      entry.lastSignature = signature;
    }

    const sourceCollectStart = performance.now();
    const sources = this.collectSources(actor, binding);
    const sourceCollectMs = performance.now() - sourceCollectStart;
    const clampedDt = Math.max(0, Math.min(dtSeconds, 1 / 15));
    const simulationStart = performance.now();
    if (clampedDt > 0 && sources.length > 0) {
      this.simulate(entry, actor, sources, clampedDt, quality);
    }
    const simulationMs = performance.now() - simulationStart;
    const uploadStart = performance.now();
    if ((clampedDt > 0 && sources.length > 0) || shouldReset) {
      this.uploadDensity(entry);
    }
    const uploadMs = performance.now() - uploadStart;
    entry.lastSimTimeSeconds = simTimeSeconds;

    const densityRange = this.computeDensityRange(entry.density);
    const previewVisible = this.setPreviewVisibility(entry, actorObject.visible === true, previewMode);
    this.kernel.store.getState().actions.setActorStatus(actor.id, {
      values: {
        volumeActorName: binding.actorName,
        previewResolution: quality.resolution,
        qualityMode: quality.qualityMode,
        previewMode,
        activeSourceCount: sources.length,
        densityRange,
        previewVisible,
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
    const previewGroup = new THREE.Group();
    previewGroup.name = "mist-volume-preview";
    previewGroup.matrixAutoUpdate = false;
    previewGroup.add(volumeMesh, boundsMesh, sliceMesh);
    const entry: MistVolumeEntry = {
      actorId,
      previewGroup,
      volumeMesh,
      boundsMesh,
      sliceMesh,
      volumeMaterial,
      sliceMaterial,
      boundsMaterial,
      texture,
      uploadBytes,
      density: new Float32Array(count),
      densityScratch: new Float32Array(count),
      velocity: new Float32Array(count * 3),
      velocityScratch: new Float32Array(count * 3),
      count,
      resolution: [...resolution] as [number, number, number],
      lastSignature: "",
      lastSimTimeSeconds: null
    };
    this.entriesByActorId.set(actorId, entry);
    return entry;
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
    binding: MistVolumeBinding
  ): void {
    const previewTint = readColor(actor.params.previewTint, "#d9eef7");
    const previewMode = readPreviewMode(actor.params.previewMode);
    const slicePosition = readNumber(actor.params.slicePosition, 0.5, 0, 1);
    const volumeUniforms = entry.volumeMaterial.uniforms as {
      uPreviewTint: { value: THREE.Color };
      uOpacityScale: { value: number };
      uDensityThreshold: { value: number };
      uRaymarchSteps: { value: number };
      uWorldToLocal: { value: THREE.Matrix4 };
    };
    volumeUniforms.uPreviewTint.value.copy(previewTint);
    volumeUniforms.uOpacityScale.value = readNumber(actor.params.previewOpacity, 1.1, 0, 4);
    volumeUniforms.uDensityThreshold.value = readNumber(actor.params.previewThreshold, 0.02, 0, 1);
    volumeUniforms.uRaymarchSteps.value = quality.previewRaymarchSteps;
    volumeUniforms.uWorldToLocal.value.copy(binding.worldToVolumeLocal);
    const sliceUniforms = entry.sliceMaterial.uniforms as {
      uPreviewTint: { value: THREE.Color };
      uOpacityScale: { value: number };
      uDensityThreshold: { value: number };
      uSliceAxis: { value: number };
      uSlicePosition: { value: number };
    };
    sliceUniforms.uPreviewTint.value.copy(previewTint);
    sliceUniforms.uOpacityScale.value = readNumber(actor.params.previewOpacity, 1.1, 0, 4);
    sliceUniforms.uDensityThreshold.value = readNumber(actor.params.previewThreshold, 0.02, 0, 1);
    sliceUniforms.uSliceAxis.value = previewMode === "slice-x" ? 0 : previewMode === "slice-y" ? 1 : 2;
    sliceUniforms.uSlicePosition.value = slicePosition;
    entry.boundsMaterial.color.copy(previewTint);
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

  private simulate(
    entry: MistVolumeEntry,
    actor: ActorNode,
    sources: MistVolumeSourceSample[],
    dtSeconds: number,
    quality: MistVolumeQualitySettings
  ): void {
    const steps = Math.max(1, quality.simulationSubsteps);
    const stepDt = dtSeconds / steps;
    const sourceRadius = Math.max(0.01, readNumber(actor.params.sourceRadius, 0.2, 0.01));
    const injectionRate = Math.max(0, readNumber(actor.params.injectionRate, 1, 0));
    const initialSpeed = Math.max(0, readNumber(actor.params.initialSpeed, 0.6, 0));
    const buoyancy = readNumber(actor.params.buoyancy, 0.35);
    const velocityDrag = clamp01(readNumber(actor.params.velocityDrag, 0.12, 0, 1));
    const diffusion = Math.max(0, readNumber(actor.params.diffusion, 0.04, 0));
    const densityDecay = clamp01(readNumber(actor.params.densityDecay, 0.08, 0, 1));
    const radiusCells = Math.max(
      1,
      Math.ceil(
        sourceRadius *
        Math.max(entry.resolution[0], entry.resolution[1], entry.resolution[2])
      )
    );

    for (let step = 0; step < steps; step += 1) {
      this.injectSources(entry, sources, radiusCells, injectionRate * stepDt, initialSpeed);
      this.diffuseVelocity(entry, diffusion, stepDt);
      this.advectDensity(entry, stepDt);
      this.applyDensityDiffusion(entry, diffusion);
      this.applyDecay(entry, densityDecay, stepDt);
      this.applyVelocityForces(entry, buoyancy, velocityDrag, stepDt);
    }
  }

  private injectSources(
    entry: MistVolumeEntry,
    sources: MistVolumeSourceSample[],
    radiusCells: number,
    densityGain: number,
    initialSpeed: number
  ): void {
    for (const source of sources) {
      const cx = ((source.positionLocal.x + 0.5) * (entry.resolution[0] - 1));
      const cy = ((source.positionLocal.y + 0.5) * (entry.resolution[1] - 1));
      const cz = ((source.positionLocal.z + 0.5) * (entry.resolution[2] - 1));
      const minX = Math.max(0, Math.floor(cx - radiusCells));
      const maxX = Math.min(entry.resolution[0] - 1, Math.ceil(cx + radiusCells));
      const minY = Math.max(0, Math.floor(cy - radiusCells));
      const maxY = Math.min(entry.resolution[1] - 1, Math.ceil(cy + radiusCells));
      const minZ = Math.max(0, Math.floor(cz - radiusCells));
      const maxZ = Math.min(entry.resolution[2] - 1, Math.ceil(cz + radiusCells));
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
            const index = cellIndex(x, y, z, entry.resolution);
            entry.density[index] = clamp01((entry.density[index] ?? 0) + densityGain * weight);
            const velocityIndex = index * 3;
            entry.velocity[velocityIndex] = (entry.velocity[velocityIndex] ?? 0) + source.directionLocal.x * initialSpeed * weight;
            entry.velocity[velocityIndex + 1] = (entry.velocity[velocityIndex + 1] ?? 0) + source.directionLocal.y * initialSpeed * weight;
            entry.velocity[velocityIndex + 2] = (entry.velocity[velocityIndex + 2] ?? 0) + source.directionLocal.z * initialSpeed * weight;
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

  private advectDensity(entry: MistVolumeEntry, stepDt: number): void {
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
          entry.densityScratch[index] = sampleTrilinear(entry.density, entry.resolution, backX, backY, backZ);
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

  private applyDecay(entry: MistVolumeEntry, densityDecay: number, stepDt: number): void {
    const decayFactor = Math.max(0, 1 - densityDecay * stepDt);
    for (let index = 0; index < entry.count; index += 1) {
      entry.density[index] = clamp01((entry.density[index] ?? 0) * decayFactor);
    }
  }

  private applyVelocityForces(entry: MistVolumeEntry, buoyancy: number, velocityDrag: number, stepDt: number): void {
    const dragFactor = Math.max(0, 1 - velocityDrag * stepDt);
    for (let index = 0; index < entry.count; index += 1) {
      const base = index * 3;
      const density = entry.density[index] ?? 0;
      const x = (entry.velocity[base] ?? 0) * dragFactor;
      const y = ((entry.velocity[base + 1] ?? 0) + buoyancy * density * stepDt) * dragFactor;
      const z = (entry.velocity[base + 2] ?? 0) * dragFactor;
      entry.velocity[base] = x;
      entry.velocity[base + 1] = y;
      entry.velocity[base + 2] = z;
    }
  }

  private uploadDensity(entry: MistVolumeEntry): void {
    for (let index = 0; index < entry.count; index += 1) {
      entry.uploadBytes[index] = Math.round(clamp01(entry.density[index] ?? 0) * 255);
    }
    entry.texture.needsUpdate = true;
  }

  private computeDensityRange(density: Float32Array): [number, number] {
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

  private disposeEntry(actorId: string): void {
    const entry = this.entriesByActorId.get(actorId);
    if (!entry) {
      return;
    }
    entry.previewGroup.parent?.remove(entry.previewGroup);
    entry.volumeMesh.geometry.dispose();
    entry.boundsMesh.geometry.dispose();
    entry.sliceMesh.geometry.dispose();
    entry.volumeMaterial.dispose();
    entry.sliceMaterial.dispose();
    entry.boundsMaterial.dispose();
    entry.texture.dispose();
    this.entriesByActorId.delete(actorId);
  }
}
