import * as THREE from "three";
import type { ActorNode, AppState, CameraState } from "@/core/types";
import { curveDataWithOverrides } from "@/features/curves/model";
import { sampleCurvePositionAndTangent } from "@/features/curves/sampler";

export interface ArcLengthSample {
  t: number;
  length: number;
}

const ARC_LENGTH_SAMPLES = 256;

function buildArcLengthTable(actor: ActorNode): ArcLengthSample[] {
  const curve = curveDataWithOverrides(actor);
  const samples: ArcLengthSample[] = [{ t: 0, length: 0 }];
  let length = 0;
  let previous = sampleCurvePositionAndTangent(curve, 0).position;
  for (let index = 1; index <= ARC_LENGTH_SAMPLES; index += 1) {
    const t = index / ARC_LENGTH_SAMPLES;
    const current = sampleCurvePositionAndTangent(curve, t).position;
    const dx = current[0] - previous[0];
    const dy = current[1] - previous[1];
    const dz = current[2] - previous[2];
    length += Math.hypot(dx, dy, dz);
    samples.push({ t, length });
    previous = current;
  }
  return samples;
}

function remapProgressToCurveT(samples: ArcLengthSample[], progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  const total = samples[samples.length - 1]?.length ?? 0;
  if (total <= 1e-6) {
    return clamped;
  }
  const targetLength = total * clamped;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    if (!previous || !next || next.length < targetLength) {
      continue;
    }
    const span = Math.max(1e-6, next.length - previous.length);
    const mix = (targetLength - previous.length) / span;
    return previous.t + (next.t - previous.t) * mix;
  }
  return 1;
}

function resolveActorWorldMatrix(actorId: string, actors: Record<string, ActorNode>): any {
  const chain: ActorNode[] = [];
  const visited = new Set<string>();
  let cursor: string | null = actorId;
  while (cursor) {
    if (visited.has(cursor)) {
      break;
    }
    visited.add(cursor);
    const nextActor: ActorNode | undefined = actors[cursor];
    if (!nextActor) {
      break;
    }
    chain.unshift(nextActor);
    cursor = nextActor.parentActorId;
  }

  const world = new THREE.Matrix4().identity();
  for (const actor of chain) {
    const local = new THREE.Matrix4();
    const position = new THREE.Vector3(...actor.transform.position);
    const rotation = new THREE.Euler(...actor.transform.rotation, "XYZ");
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    const scale = new THREE.Vector3(...actor.transform.scale);
    local.compose(position, quaternion, scale);
    world.multiply(local);
  }
  return world;
}

function sampleCurveWorldPoint(
  actor: ActorNode,
  actors: Record<string, ActorNode>,
  t: number
): { position: [number, number, number]; tangent: [number, number, number] } {
  const sampled = sampleCurvePositionAndTangent(curveDataWithOverrides(actor), t);
  const worldMatrix = resolveActorWorldMatrix(actor.id, actors);
  const worldPosition = new THREE.Vector3(...sampled.position).applyMatrix4(worldMatrix);
  const normalMatrix = new THREE.Matrix3().setFromMatrix4(worldMatrix);
  const worldTangent = new THREE.Vector3(...sampled.tangent).applyMatrix3(normalMatrix).normalize();
  return {
    position: [worldPosition.x, worldPosition.y, worldPosition.z],
    tangent: [worldTangent.x, worldTangent.y, worldTangent.z]
  };
}

function actorWorldOrigin(actor: ActorNode, actors: Record<string, ActorNode>): [number, number, number] {
  const worldMatrix = resolveActorWorldMatrix(actor.id, actors);
  const worldPosition = new THREE.Vector3(0, 0, 0).applyMatrix4(worldMatrix);
  return [worldPosition.x, worldPosition.y, worldPosition.z];
}

export function solveRenderCamera(
  state: AppState,
  baseCamera: CameraState,
  progress: number,
  cameraPathActorId: string,
  cameraTargetActorId: string,
  pathArcTableCache: Map<string, ArcLengthSample[]>
): CameraState {
  const next: CameraState = structuredClone(baseCamera);
  const pathActor = cameraPathActorId ? state.actors[cameraPathActorId] : undefined;
  const targetActor = cameraTargetActorId ? state.actors[cameraTargetActorId] : undefined;

  const basePosition = new THREE.Vector3(...baseCamera.position);
  const baseTarget = new THREE.Vector3(...baseCamera.target);
  const baseAim = new THREE.Vector3().subVectors(baseTarget, basePosition);
  if (baseAim.lengthSq() <= 1e-8) {
    baseAim.set(0, 0, -1);
  }

  if (pathActor && pathActor.actorType === "curve") {
    const samples = pathArcTableCache.get(pathActor.id) ?? buildArcLengthTable(pathActor);
    pathArcTableCache.set(pathActor.id, samples);
    const t = remapProgressToCurveT(samples, progress);
    const sampled = sampleCurveWorldPoint(pathActor, state.actors, t);
    next.position = sampled.position;
    if (!targetActor) {
      const position = new THREE.Vector3(...next.position);
      const target = position.add(baseAim);
      next.target = [target.x, target.y, target.z];
    }
  }

  if (targetActor) {
    if (targetActor.actorType === "curve") {
      const sampled = sampleCurveWorldPoint(targetActor, state.actors, progress);
      next.target = sampled.position;
    } else {
      next.target = actorWorldOrigin(targetActor, state.actors);
    }
  }

  return next;
}
