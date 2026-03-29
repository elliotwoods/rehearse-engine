import type { ActorNode, RenderEngine } from "@/core/types";

export function incompatibilityReason(actor: ActorNode, engine: RenderEngine): string | null {
  if (engine === "webgpu" && actor.actorType === "gaussian-splat-spark") {
    return "Gaussian Splat actor requires WebGL2.";
  }
  if (engine === "webgpu" && actor.actorType === "mist-volume") {
    return "Mist Volume actor currently requires WebGL2.";
  }
  if (
    engine === "webgl2" &&
    actor.actorType === "plugin" &&
    actor.pluginType === "plugin.gaussianSplat.webgpu"
  ) {
    return "Gaussian Splat (WebGPU) plugin requires the WebGPU render engine.";
  }
  return null;
}
