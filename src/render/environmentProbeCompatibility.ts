import * as THREE from "three";
import type { ActorNode, RenderEngine } from "@/core/types";
import { incompatibilityReason } from "@/render/engineCompatibility";

function collectMaterials(object: THREE.Object3D): THREE.Material[] {
  const materials: THREE.Material[] = [];
  object.traverse((node) => {
    const maybeMaterial = (node as THREE.Object3D & { material?: THREE.Material | THREE.Material[] | null }).material;
    if (!maybeMaterial) {
      return;
    }
    if (Array.isArray(maybeMaterial)) {
      for (const material of maybeMaterial) {
        if (material) {
          materials.push(material);
        }
      }
      return;
    }
    materials.push(maybeMaterial);
  });
  return materials;
}

function findWebGpuIncompatibleMaterial(object: THREE.Object3D): THREE.Material | null {
  for (const material of collectMaterials(object)) {
    if (material instanceof THREE.ShaderMaterial || material instanceof THREE.RawShaderMaterial) {
      return material;
    }
    const candidate = material as THREE.Material & {
      isShaderMaterial?: boolean;
      isNodeMaterial?: boolean;
    };
    if (candidate.isShaderMaterial === true && candidate.isNodeMaterial !== true) {
      return material;
    }
  }
  return null;
}

export function environmentProbeCaptureIncompatibilityReason(
  actor: ActorNode,
  object: THREE.Object3D | null,
  engine: RenderEngine
): string | null {
  const actorReason = incompatibilityReason(actor, engine);
  if (actorReason) {
    return actorReason;
  }
  if (engine !== "webgpu" || !object) {
    return null;
  }
  const incompatibleMaterial = findWebGpuIncompatibleMaterial(object);
  if (!incompatibleMaterial) {
    return null;
  }
  return `${incompatibleMaterial.type} is not compatible with WebGPU environment probe capture.`;
}

export function formatEnvironmentProbeSkippedWarning(skipped: Array<{ name: string; reason: string }>): string | null {
  if (skipped.length === 0) {
    return null;
  }
  const summary = skipped
    .slice(0, 3)
    .map((entry) => `${entry.name}: ${entry.reason}`)
    .join(" | ");
  const remaining = skipped.length - Math.min(skipped.length, 3);
  if (remaining > 0) {
    return `Environment probe skipped ${skipped.length} actors. ${summary} | +${remaining} more.`;
  }
  return `Environment probe skipped ${skipped.length} actors. ${summary}`;
}
