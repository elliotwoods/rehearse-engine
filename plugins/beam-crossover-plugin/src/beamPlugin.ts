import * as THREE from "three";
import type {
  ActorNode,
  ActorRuntimeStatus,
  ActorStatusEntry,
  BeamArrayParams,
  BeamParams,
  PluginDefinition,
  PrimitiveDimensions,
  PrimitiveShape,
  ReloadableDescriptor,
  SceneHookContext
} from "./contracts";
import {
  buildBeamGeometryWorld,
  buildCombinedBeamGeometryWorld,
  computeSilhouetteWorld,
  sampleArcLengthCurveTs
} from "./math";

const SOLID_BEAM_TYPE = "solid";
const DEFAULT_RESOLUTION = 256;
const DEFAULT_BEAM_LENGTH = 100;
const DEFAULT_BEAM_COLOR = "#ffffff";
const DEFAULT_BEAM_ALPHA = 0.1;
const DEFAULT_ARRAY_COUNT = 32;
const LATE_RENDER_ORDER = 10_000;
const GHOST_BEAM_TYPE = "ghost";

type BeamMaterial = THREE.MeshBasicMaterial | THREE.ShaderMaterial;

interface BeamObjectState {
  mesh: THREE.Mesh;
  material: BeamMaterial;
  geometry: THREE.BufferGeometry;
  lastGeometrySignature: string;
  lastMaterialSignature: string;
}

interface BeamRuntime {
  mode: "single" | "array";
}

function createBeamRoot(): THREE.Group {
  const geometry = new THREE.BufferGeometry();
  const material = createSolidMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "beam-crossover-mesh";
  mesh.renderOrder = LATE_RENDER_ORDER;
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.name = "beam-crossover-root";
  group.add(mesh);
  (group.userData as { beamState?: BeamObjectState }).beamState = {
    mesh,
    material,
    geometry,
    lastGeometrySignature: "",
    lastMaterialSignature: ""
  };
  return group;
}

function getBeamState(object: unknown): BeamObjectState | null {
  if (!(object instanceof THREE.Group)) {
    return null;
  }
  const userData = object.userData as { beamState?: BeamObjectState };
  return userData.beamState ?? null;
}

function sanitizeColor(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_BEAM_COLOR;
  }
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed) ? trimmed : DEFAULT_BEAM_COLOR;
}

function parseBeamParams(actor: ActorNode): BeamParams {
  const beamType = actor.params.beamType;
  return {
    targetActorId: typeof actor.params.targetActorId === "string" ? actor.params.targetActorId : null,
    beamType: beamType === GHOST_BEAM_TYPE ? GHOST_BEAM_TYPE : SOLID_BEAM_TYPE,
    resolution: Math.max(3, Math.min(1024, Math.floor(Number(actor.params.resolution ?? DEFAULT_RESOLUTION)) || DEFAULT_RESOLUTION)),
    beamLength: Math.max(0, Number(actor.params.beamLength ?? DEFAULT_BEAM_LENGTH) || DEFAULT_BEAM_LENGTH),
    beamColor: sanitizeColor(actor.params.beamColor),
    beamAlpha: Math.max(0, Math.min(1, Number(actor.params.beamAlpha ?? DEFAULT_BEAM_ALPHA) || DEFAULT_BEAM_ALPHA))
  };
}

function parseBeamArrayParams(actor: ActorNode): BeamArrayParams {
  const base = parseBeamParams(actor);
  return {
    ...base,
    emitterCurveId: typeof actor.params.emitterCurveId === "string" ? actor.params.emitterCurveId : null,
    count: Math.max(1, Math.min(512, Math.floor(Number(actor.params.count ?? DEFAULT_ARRAY_COUNT)) || DEFAULT_ARRAY_COUNT))
  };
}

function formatVector(value: THREE.Vector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function readPrimitiveShape(actor: ActorNode): PrimitiveShape | null {
  const shape = actor.params.shape;
  return shape === "sphere" || shape === "cube" || shape === "cylinder" ? shape : null;
}

function readPrimitiveDimensions(actor: ActorNode): PrimitiveDimensions {
  return {
    cubeSize: Math.max(0, Number(actor.params.cubeSize ?? 1) || 1),
    sphereRadius: Math.max(0, Number(actor.params.sphereRadius ?? 0.5) || 0.5),
    cylinderRadius: Math.max(0, Number(actor.params.cylinderRadius ?? 0.5) || 0.5),
    cylinderHeight: Math.max(0, Number(actor.params.cylinderHeight ?? 1) || 1)
  };
}

function setStatus(context: SceneHookContext, values: Record<string, unknown>, error?: string): void {
  context.setActorStatus({
    values,
    error,
    updatedAtIso: new Date().toISOString()
  });
}

function buildSingleStatus(actor: ActorNode, runtimeStatus?: ActorRuntimeStatus): ActorStatusEntry[] {
  const params = parseBeamParams(actor);
  return [
    { label: "Type", value: "Beam Emitter" },
    { label: "Beam Type", value: params.beamType },
    { label: "Ghost Shading Active", value: params.beamType === GHOST_BEAM_TYPE },
    { label: "Target Actor", value: runtimeStatus?.values.targetActorName ?? "n/a" },
    { label: "Target Shape", value: runtimeStatus?.values.targetShape ?? "n/a" },
    { label: "Resolution", value: params.resolution },
    { label: "Beam Length (m)", value: params.beamLength },
    { label: "Beam Color", value: params.beamColor },
    { label: "Beam Alpha", value: params.beamAlpha },
    { label: "Contour Points", value: runtimeStatus?.values.contourPointCount ?? 0 },
    { label: "Triangles", value: runtimeStatus?.values.triangleCount ?? 0 },
    { label: "Emitter Position (m)", value: runtimeStatus?.values.emitterPosition ?? "n/a" },
    { label: "Target Center (m)", value: runtimeStatus?.values.targetCenter ?? "n/a" },
    { label: "Render Order", value: runtimeStatus?.values.renderOrder ?? LATE_RENDER_ORDER },
    { label: "Updated", value: runtimeStatus?.updatedAtIso ? new Date(runtimeStatus.updatedAtIso).toLocaleString() : "n/a" },
    { label: "Error", value: runtimeStatus?.error ?? null, tone: "error" }
  ];
}

function buildArrayStatus(actor: ActorNode, runtimeStatus?: ActorRuntimeStatus): ActorStatusEntry[] {
  const params = parseBeamArrayParams(actor);
  return [
    { label: "Type", value: "Beam Emitter Array" },
    { label: "Beam Type", value: params.beamType },
    { label: "Ghost Shading Active", value: params.beamType === GHOST_BEAM_TYPE },
    { label: "Emitter Curve", value: runtimeStatus?.values.emitterCurveName ?? "n/a" },
    { label: "Target Actor", value: runtimeStatus?.values.targetActorName ?? "n/a" },
    { label: "Target Shape", value: runtimeStatus?.values.targetShape ?? "n/a" },
    { label: "Requested Count", value: params.count },
    { label: "Active Beams", value: runtimeStatus?.values.activeBeamCount ?? 0 },
    { label: "Skipped Beams", value: runtimeStatus?.values.skippedBeamCount ?? 0 },
    { label: "Contour Points / Beam", value: runtimeStatus?.values.contourPointCount ?? 0 },
    { label: "Triangles", value: runtimeStatus?.values.triangleCount ?? 0 },
    { label: "Curve Closed", value: runtimeStatus?.values.curveClosed ?? "n/a" },
    { label: "Curve LUT Samples", value: runtimeStatus?.values.curveLutSamples ?? 0 },
    { label: "Ignores Actor Transform", value: true },
    { label: "Render Order", value: runtimeStatus?.values.renderOrder ?? LATE_RENDER_ORDER },
    { label: "Updated", value: runtimeStatus?.updatedAtIso ? new Date(runtimeStatus.updatedAtIso).toLocaleString() : "n/a" },
    { label: "Error", value: runtimeStatus?.error ?? null, tone: "error" }
  ];
}

export function computeGhostAlpha(viewVector: THREE.Vector3, normalVector: THREE.Vector3, alphaScale: number): number {
  const safeAlpha = Math.max(0, Math.min(1, alphaScale));
  const view = viewVector.clone();
  const normal = normalVector.clone();
  if (view.lengthSq() <= 1e-12 || normal.lengthSq() <= 1e-12) {
    return 0;
  }
  view.normalize();
  normal.normalize();
  return safeAlpha * Math.max(0, Math.min(1, 1 - view.cross(normal).length()));
}

function createSolidMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: DEFAULT_BEAM_ALPHA,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  material.userData.beamMaterialKind = SOLID_BEAM_TYPE;
  return material;
}

function createGhostMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      beamColor: { value: new THREE.Color(DEFAULT_BEAM_COLOR) },
      beamAlpha: { value: DEFAULT_BEAM_ALPHA }
    },
    vertexShader: `
      varying vec3 vViewPosition;
      varying vec3 vViewNormal;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = mvPosition.xyz;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 beamColor;
      uniform float beamAlpha;
      varying vec3 vViewPosition;
      varying vec3 vViewNormal;

      void main() {
        vec3 viewDir = normalize(vViewPosition);
        vec3 normalDir = normalize(vViewNormal);
        float ghost = clamp(1.0 - length(cross(viewDir, normalDir)), 0.0, 1.0);
        gl_FragColor = vec4(beamColor, beamAlpha * ghost);
      }
    `
  });
  material.userData.beamMaterialKind = GHOST_BEAM_TYPE;
  return material;
}

type GhostMaterialUniforms = {
  beamColor: { value: THREE.Color };
  beamAlpha: { value: number };
};

function readCameraPosition(state: SceneHookContext["state"]): THREE.Vector3 {
  const position = state.camera?.position;
  if (Array.isArray(position) && position.length === 3) {
    return new THREE.Vector3(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
  }
  return new THREE.Vector3();
}

function updateMaterial(state: BeamObjectState, params: BeamParams, _cameraPosition: THREE.Vector3): void {
  const materialSignature = JSON.stringify({
    beamType: params.beamType,
    beamColor: params.beamColor,
    beamAlpha: params.beamAlpha
  });
  if (params.beamType === GHOST_BEAM_TYPE) {
    if (!(state.material instanceof THREE.ShaderMaterial) || state.material.userData.beamMaterialKind !== GHOST_BEAM_TYPE) {
      state.material.dispose();
      state.material = createGhostMaterial();
      state.mesh.material = state.material;
    }
    const material = state.material;
    const uniforms = material.uniforms as GhostMaterialUniforms;
    uniforms.beamColor.value.set(params.beamColor);
    uniforms.beamAlpha.value = params.beamAlpha;
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.blending = THREE.AdditiveBlending;
    material.needsUpdate = materialSignature !== state.lastMaterialSignature;
  } else {
    if (!(state.material instanceof THREE.MeshBasicMaterial) || state.material.userData.beamMaterialKind !== SOLID_BEAM_TYPE) {
      state.material.dispose();
      state.material = createSolidMaterial();
      state.mesh.material = state.material;
    }
    const material = state.material;
    material.color.set(params.beamColor);
    material.transparent = true;
    material.opacity = params.beamAlpha;
    material.blending = THREE.AdditiveBlending;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.needsUpdate = materialSignature !== state.lastMaterialSignature;
  }
  state.lastMaterialSignature = materialSignature;
  state.mesh.renderOrder = LATE_RENDER_ORDER;
}

function getWorldInverse(object: THREE.Object3D): THREE.Matrix4 {
  object.updateWorldMatrix(true, false);
  return object.matrixWorld.clone().invert();
}

function getWorldPosition(object: THREE.Object3D): THREE.Vector3 {
  object.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
}

function buildSingleGeometrySignature(params: BeamParams, emitterObject: THREE.Object3D, targetObject: THREE.Object3D, targetActor: ActorNode): string {
  emitterObject.updateWorldMatrix(true, false);
  targetObject.updateWorldMatrix(true, false);
  return JSON.stringify({
    beamLength: params.beamLength,
    resolution: params.resolution,
    emitterMatrix: emitterObject.matrixWorld.elements.map((value) => Number(value.toFixed(6))),
    targetMatrix: targetObject.matrixWorld.elements.map((value) => Number(value.toFixed(6))),
    shape: targetActor.params.shape,
    cubeSize: targetActor.params.cubeSize,
    sphereRadius: targetActor.params.sphereRadius,
    cylinderRadius: targetActor.params.cylinderRadius,
    cylinderHeight: targetActor.params.cylinderHeight
  });
}

function buildArrayGeometrySignature(params: BeamArrayParams, targetObject: THREE.Object3D, targetActor: ActorNode, curveActor: ActorNode): string {
  targetObject.updateWorldMatrix(true, false);
  return JSON.stringify({
    beamLength: params.beamLength,
    resolution: params.resolution,
    count: params.count,
    targetMatrix: targetObject.matrixWorld.elements.map((value) => Number(value.toFixed(6))),
    shape: targetActor.params.shape,
    cubeSize: targetActor.params.cubeSize,
    sphereRadius: targetActor.params.sphereRadius,
    cylinderRadius: targetActor.params.cylinderRadius,
    cylinderHeight: targetActor.params.cylinderHeight,
    curveTransform: curveActor.transform,
    curveData: curveActor.params.curveData,
    curveClosed: curveActor.params.closed,
    curveSamplesPerSegment: curveActor.params.samplesPerSegment
  });
}

function getCurveMetadata(actor: ActorNode): { closed: boolean; segmentCount: number } {
  const points = Array.isArray((actor.params.curveData as { points?: unknown[] } | undefined)?.points)
    ? ((actor.params.curveData as { points?: unknown[] }).points ?? [])
    : [];
  const closed = Boolean(actor.params.closed);
  const pointCount = points.length;
  return {
    closed,
    segmentCount: pointCount < 2 ? 0 : closed ? pointCount : pointCount - 1
  };
}

function syncSingleEmitter(context: SceneHookContext, root: THREE.Group, state: BeamObjectState): void {
  const params = parseBeamParams(context.actor);
  const targetActor = params.targetActorId ? context.getActorById(params.targetActorId) : null;
  const targetObject = params.targetActorId ? context.getActorObject(params.targetActorId) : null;
  if (!targetActor || targetActor.actorType !== "primitive" || !(targetObject instanceof THREE.Object3D)) {
    state.mesh.visible = false;
    setStatus(context, {
      targetActorName: targetActor?.name ?? "n/a",
      targetShape: "n/a",
      contourPointCount: 0,
      triangleCount: 0,
      renderOrder: LATE_RENDER_ORDER
    }, "Target actor must be a primitive with a scene object.");
    return;
  }

  const shape = readPrimitiveShape(targetActor);
  if (!shape) {
    state.mesh.visible = false;
    setStatus(context, {
      targetActorName: targetActor.name,
      targetShape: "unsupported",
      contourPointCount: 0,
      triangleCount: 0,
      renderOrder: LATE_RENDER_ORDER
    }, "Unsupported primitive shape.");
    return;
  }

  updateMaterial(state, params, readCameraPosition(context.state));

  const signature = buildSingleGeometrySignature(params, root, targetObject, targetActor);
  if (signature === state.lastGeometrySignature) {
    return;
  }

  const emitterWorld = getWorldPosition(root);
  targetObject.updateWorldMatrix(true, false);
  const silhouette = computeSilhouetteWorld({
    shape,
    dimensions: readPrimitiveDimensions(targetActor),
    targetWorldMatrix: targetObject.matrixWorld.clone(),
    emitterWorld,
    resolution: params.resolution
  });

  if (!silhouette.ok) {
    state.mesh.visible = false;
    setStatus(context, {
      targetActorName: targetActor.name,
      targetShape: shape,
      contourPointCount: 0,
      triangleCount: 0,
      emitterPosition: formatVector(emitterWorld),
      targetCenter: formatVector(silhouette.targetCenterWorld),
      renderOrder: LATE_RENDER_ORDER
    }, silhouette.reason);
    return;
  }

  const geometry = buildBeamGeometryWorld(emitterWorld, silhouette.contourWorld, params.beamLength, getWorldInverse(root));
  state.geometry.dispose();
  state.geometry = geometry;
  state.mesh.geometry = geometry;
  state.mesh.visible = true;
  state.lastGeometrySignature = signature;
  setStatus(context, {
    targetActorName: targetActor.name,
    targetShape: shape,
    contourPointCount: silhouette.contourWorld.length,
    triangleCount: silhouette.contourWorld.length,
    emitterPosition: formatVector(emitterWorld),
    targetCenter: formatVector(silhouette.targetCenterWorld),
    shadingMode: params.beamType,
    renderOrder: LATE_RENDER_ORDER
  });
}

function syncEmitterArray(context: SceneHookContext, root: THREE.Group, state: BeamObjectState): void {
  const params = parseBeamArrayParams(context.actor);
  const targetActor = params.targetActorId ? context.getActorById(params.targetActorId) : null;
  const curveActor = params.emitterCurveId ? context.getActorById(params.emitterCurveId) : null;
  const targetObject = params.targetActorId ? context.getActorObject(params.targetActorId) : null;
  if (!targetActor || targetActor.actorType !== "primitive" || !curveActor || curveActor.actorType !== "curve" || !(targetObject instanceof THREE.Object3D)) {
    state.mesh.visible = false;
    setStatus(context, {
      emitterCurveName: curveActor?.name ?? "n/a",
      targetActorName: targetActor?.name ?? "n/a",
      targetShape: "n/a",
      activeBeamCount: 0,
      skippedBeamCount: params.count,
      contourPointCount: 0,
      triangleCount: 0,
      renderOrder: LATE_RENDER_ORDER
    }, "Emitter Curve and Target Actor must reference valid curve/primitive actors.");
    return;
  }

  const shape = readPrimitiveShape(targetActor);
  if (!shape) {
    state.mesh.visible = false;
    setStatus(context, {
      emitterCurveName: curveActor.name,
      targetActorName: targetActor.name,
      targetShape: "unsupported",
      activeBeamCount: 0,
      skippedBeamCount: params.count,
      contourPointCount: 0,
      triangleCount: 0,
      renderOrder: LATE_RENDER_ORDER
    }, "Unsupported primitive shape.");
    return;
  }

  updateMaterial(state, params, readCameraPosition(context.state));

  const signature = buildArrayGeometrySignature(params, targetObject, targetActor, curveActor);
  if (signature === state.lastGeometrySignature) {
    return;
  }

  targetObject.updateWorldMatrix(true, false);
  const targetWorldMatrix = targetObject.matrixWorld.clone();
  const curveMetadata = getCurveMetadata(curveActor);
  const curveLutSamples = Math.max(128, curveMetadata.segmentCount * 64, params.count * 16);
  const ts = sampleArcLengthCurveTs(
    params.count,
    curveMetadata.closed,
    (t) => {
      const sampled = params.emitterCurveId ? context.sampleCurveWorldPoint(params.emitterCurveId, t) : null;
      return sampled ? new THREE.Vector3(...sampled.position) : null;
    },
    curveLutSamples
  );

  const placements: Array<{ emitterWorld: THREE.Vector3; contourWorld: THREE.Vector3[] }> = [];
  let skippedBeamCount = 0;
  let targetCenter = new THREE.Vector3();
  let lastError: string | undefined;
  for (const t of ts) {
    const sampled = params.emitterCurveId ? context.sampleCurveWorldPoint(params.emitterCurveId, t) : null;
    if (!sampled) {
      skippedBeamCount += 1;
      lastError = "Curve sampling returned no world point.";
      continue;
    }
    const emitterWorld = new THREE.Vector3(...sampled.position);
    const silhouette = computeSilhouetteWorld({
      shape,
      dimensions: readPrimitiveDimensions(targetActor),
      targetWorldMatrix,
      emitterWorld,
      resolution: params.resolution
    });
    targetCenter = silhouette.targetCenterWorld.clone();
    if (!silhouette.ok) {
      skippedBeamCount += 1;
      lastError = silhouette.reason;
      continue;
    }
    placements.push({
      emitterWorld,
      contourWorld: silhouette.contourWorld
    });
  }

  if (placements.length === 0) {
    state.mesh.visible = false;
    setStatus(context, {
      emitterCurveName: curveActor.name,
      targetActorName: targetActor.name,
      targetShape: shape,
      activeBeamCount: 0,
      skippedBeamCount,
      contourPointCount: params.resolution,
      triangleCount: 0,
      curveClosed: curveMetadata.closed,
      curveLutSamples,
      targetCenter: formatVector(targetCenter),
      renderOrder: LATE_RENDER_ORDER
    }, lastError ?? "No valid beam placements were produced.");
    return;
  }

  const geometry = buildCombinedBeamGeometryWorld(placements, params.beamLength, getWorldInverse(root));
  state.geometry.dispose();
  state.geometry = geometry;
  state.mesh.geometry = geometry;
  state.mesh.visible = true;
  state.lastGeometrySignature = signature;
  setStatus(context, {
    emitterCurveName: curveActor.name,
    targetActorName: targetActor.name,
    targetShape: shape,
    activeBeamCount: placements.length,
    skippedBeamCount,
    contourPointCount: params.resolution,
    triangleCount: placements.length * params.resolution,
    curveClosed: curveMetadata.closed,
    curveLutSamples,
    targetCenter: formatVector(targetCenter),
    shadingMode: params.beamType,
    renderOrder: LATE_RENDER_ORDER
  });
}

function disposeBeamObject(object: unknown): void {
  const state = getBeamState(object);
  if (!state) {
    return;
  }
  state.geometry.dispose();
  state.material.dispose();
}

const sharedBeamParams = [
  {
    key: "beamType",
    label: "Beam Type",
    type: "select",
    options: [SOLID_BEAM_TYPE, GHOST_BEAM_TYPE],
    defaultValue: SOLID_BEAM_TYPE
  },
  {
    key: "resolution",
    label: "Resolution",
    type: "number",
    min: 3,
    max: 1024,
    step: 1,
    defaultValue: DEFAULT_RESOLUTION
  },
  {
    key: "beamLength",
    label: "Beam Length",
    type: "number",
    unit: "m",
    min: 0,
    step: 0.05,
    defaultValue: DEFAULT_BEAM_LENGTH
  },
  {
    key: "beamColor",
    label: "Beam Color",
    type: "color",
    defaultValue: DEFAULT_BEAM_COLOR
  },
  {
    key: "beamAlpha",
    label: "Beam Alpha",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: DEFAULT_BEAM_ALPHA
  }
] satisfies Array<Record<string, unknown>>;

export const beamEmitterDescriptor: ReloadableDescriptor<BeamRuntime> = {
  id: "plugin.beamCrossover.emitter",
  kind: "actor",
  version: 1,
  schema: {
    id: "plugin.beamCrossover.emitter",
    title: "Beam Emitter",
    params: [
      {
        key: "targetActorId",
        label: "Target Actor",
        type: "actor-ref",
        allowedActorTypes: ["primitive"],
        allowSelf: false
      },
      ...sharedBeamParams
    ]
  },
  spawn: {
    actorType: "plugin",
    pluginType: "plugin.beamCrossover.emitter",
    label: "Beam Emitter",
    description: "Analytic volumetric beam emitter targeting a primitive silhouette.",
    iconGlyph: "BM"
  },
  createRuntime: () => ({ mode: "single" }),
  updateRuntime: () => {},
  sceneHooks: {
    createObject: () => createBeamRoot(),
    syncObject: (context) => {
      const root = context.object instanceof THREE.Group ? context.object : null;
      const state = root ? getBeamState(root) : null;
      if (!root || !state) {
        context.setActorStatus({
          values: {},
          error: "Beam root object is invalid.",
          updatedAtIso: new Date().toISOString()
        });
        return;
      }
      syncSingleEmitter(context, root, state);
    },
    disposeObject: ({ object }) => {
      disposeBeamObject(object);
    }
  },
  status: {
    build({ actor, runtimeStatus }) {
      return buildSingleStatus(actor, runtimeStatus);
    }
  }
};

export const beamEmitterArrayDescriptor: ReloadableDescriptor<BeamRuntime> = {
  id: "plugin.beamCrossover.emitterArray",
  kind: "actor",
  version: 1,
  schema: {
    id: "plugin.beamCrossover.emitterArray",
    title: "Beam Emitter Array",
    params: [
      {
        key: "emitterCurveId",
        label: "Emitter Curve",
        type: "actor-ref",
        allowedActorTypes: ["curve"],
        allowSelf: false
      },
      {
        key: "targetActorId",
        label: "Target Actor",
        type: "actor-ref",
        allowedActorTypes: ["primitive"],
        allowSelf: false
      },
      {
        key: "count",
        label: "Count",
        type: "number",
        min: 1,
        max: 512,
        step: 1,
        defaultValue: DEFAULT_ARRAY_COUNT
      },
      ...sharedBeamParams
    ]
  },
  spawn: {
    actorType: "plugin",
    pluginType: "plugin.beamCrossover.emitterArray",
    label: "Beam Emitter Array",
    description: "Arc-length-spaced beam emitters driven by a curve.",
    iconGlyph: "BA"
  },
  createRuntime: () => ({ mode: "array" }),
  updateRuntime: () => {},
  sceneHooks: {
    createObject: () => createBeamRoot(),
    syncObject: (context) => {
      const root = context.object instanceof THREE.Group ? context.object : null;
      const state = root ? getBeamState(root) : null;
      if (!root || !state) {
        context.setActorStatus({
          values: {},
          error: "Beam root object is invalid.",
          updatedAtIso: new Date().toISOString()
        });
        return;
      }
      syncEmitterArray(context, root, state);
    },
    disposeObject: ({ object }) => {
      disposeBeamObject(object);
    }
  },
  status: {
    build({ actor, runtimeStatus }) {
      return buildArrayStatus(actor, runtimeStatus);
    }
  }
};

export function createBeamCrossoverPlugin(): PluginDefinition {
  return {
    id: "beam.crossover",
    name: "Beam Crossover",
    actorDescriptors: [beamEmitterDescriptor, beamEmitterArrayDescriptor],
    componentDescriptors: []
  };
}
