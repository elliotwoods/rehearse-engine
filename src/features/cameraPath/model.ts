import * as THREE from "three";
import type { ActorNode } from "@/core/types";
import { curveDataWithOverrides } from "@/features/curves/model";
import { sampleCurvePositionAndTangent } from "@/features/curves/sampler";

export interface ArcLengthSample {
  t: number;
  length: number;
}

export interface CameraPathRefs {
  positionCurveActor: ActorNode | null;
  targetCurveActor: ActorNode | null;
  targetMode: "curve" | "actor";
  targetActor: ActorNode | null;
}

export interface CameraPathPose {
  position: [number, number, number];
  target: [number, number, number];
}

function getCameraPathTargetMode(value: unknown): "curve" | "actor" {
  return value === "actor" ? "actor" : "curve";
}

export function getCameraPathPreviewDurationSeconds(actor: ActorNode): number {
  const raw = Number(actor.params.previewDurationSeconds);
  if (!Number.isFinite(raw)) {
    return 5;
  }
  return Math.max(0.1, Math.min(600, raw));
}

export function resolveCameraPathRefs(cameraPathActor: ActorNode, actors: Record<string, ActorNode>): CameraPathRefs {
  const positionCurveActorId =
    typeof cameraPathActor.params.positionCurveActorId === "string" ? cameraPathActor.params.positionCurveActorId : "";
  const targetCurveActorId =
    typeof cameraPathActor.params.targetCurveActorId === "string" ? cameraPathActor.params.targetCurveActorId : "";
  const targetActorId = typeof cameraPathActor.params.targetActorId === "string" ? cameraPathActor.params.targetActorId : "";
  const positionCurveActor = actors[positionCurveActorId];
  const targetCurveActor = actors[targetCurveActorId];
  const targetActor = actors[targetActorId];
  return {
    positionCurveActor: positionCurveActor?.actorType === "curve" ? positionCurveActor : null,
    targetCurveActor: targetCurveActor?.actorType === "curve" ? targetCurveActor : null,
    targetMode: getCameraPathTargetMode(cameraPathActor.params.targetMode),
    targetActor: targetActor ?? null
  };
}

export function getCameraPathKeyframeCount(cameraPathActor: ActorNode, actors: Record<string, ActorNode>): number {
  const refs = resolveCameraPathRefs(cameraPathActor, actors);
  const positionCount = refs.positionCurveActor ? curveDataWithOverrides(refs.positionCurveActor).points.length : 0;
  if (refs.targetMode === "actor") {
    return positionCount;
  }
  const targetCount = refs.targetCurveActor ? curveDataWithOverrides(refs.targetCurveActor).points.length : 0;
  return Math.min(positionCount, targetCount);
}

export function getCameraPathValidity(cameraPathActor: ActorNode, actors: Record<string, ActorNode>): {
  ok: boolean;
  message: string | null;
} {
  const refs = resolveCameraPathRefs(cameraPathActor, actors);
  if (!refs.positionCurveActor) {
    return { ok: false, message: "Missing managed position curve." };
  }
  if (refs.targetMode === "curve" && !refs.targetCurveActor) {
    return { ok: false, message: "Missing managed target curve." };
  }
  if (refs.targetMode === "actor" && !refs.targetActor) {
    return { ok: false, message: "Target actor is not assigned." };
  }
  return { ok: true, message: null };
}

export function buildSinglePointCurveData(position: [number, number, number]) {
  return {
    closed: false,
    points: [
      {
        position: [...position] as [number, number, number],
        handleIn: [-0.3, 0, 0] as [number, number, number],
        handleOut: [0.3, 0, 0] as [number, number, number],
        mode: "mirrored" as const,
        handleInMode: "normal" as const,
        handleOutMode: "normal" as const,
        enabled: true
      }
    ]
  };
}

export function buildCameraPathArcLengthTable(actor: ActorNode): ArcLengthSample[] {
  const curve = curveDataWithOverrides(actor);
  const samples: ArcLengthSample[] = [{ t: 0, length: 0 }];
  let length = 0;
  let previous = sampleCurvePositionAndTangent(curve, 0).position;
  for (let index = 1; index <= 256; index += 1) {
    const t = index / 256;
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

export function remapProgressToCurveT(samples: ArcLengthSample[], progress: number): number {
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

export function resolveActorWorldMatrix(actorId: string, actors: Record<string, ActorNode>): THREE.Matrix4 {
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

export function sampleCurveWorldPoint(
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

export function actorWorldOrigin(actor: ActorNode, actors: Record<string, ActorNode>): [number, number, number] {
  const worldMatrix = resolveActorWorldMatrix(actor.id, actors);
  const worldPosition = new THREE.Vector3(0, 0, 0).applyMatrix4(worldMatrix);
  return [worldPosition.x, worldPosition.y, worldPosition.z];
}

export function sampleCameraPathPoseAtProgress(
  cameraPathActor: ActorNode,
  actors: Record<string, ActorNode>,
  progress: number,
  pathArcTableCache?: Map<string, ArcLengthSample[]>
): CameraPathPose | null {
  const refs = resolveCameraPathRefs(cameraPathActor, actors);
  if (!refs.positionCurveActor) {
    return null;
  }
  const positionSamples =
    pathArcTableCache?.get(refs.positionCurveActor.id) ?? buildCameraPathArcLengthTable(refs.positionCurveActor);
  pathArcTableCache?.set(refs.positionCurveActor.id, positionSamples);
  const positionT = remapProgressToCurveT(positionSamples, progress);
  const position = sampleCurveWorldPoint(refs.positionCurveActor, actors, positionT).position;

  if (refs.targetMode === "actor") {
    if (!refs.targetActor) {
      return null;
    }
    return {
      position,
      target: actorWorldOrigin(refs.targetActor, actors)
    };
  }

  if (!refs.targetCurveActor) {
    return null;
  }
  const keyframeCount = getCameraPathKeyframeCount(cameraPathActor, actors);
  const targetProgress = keyframeCount <= 1 ? 0 : Math.max(0, Math.min(1, progress));
  return {
    position,
    target: sampleCurveWorldPoint(refs.targetCurveActor, actors, targetProgress).position
  };
}
