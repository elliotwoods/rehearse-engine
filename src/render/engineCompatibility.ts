import type { ActorNode, RenderEngine } from "@/core/types";

export function incompatibilityReason(actor: ActorNode, engine: RenderEngine): string | null {
  if (engine === "webgl2" && actor.actorType === "gaussian-splat") {
    return "Native Gaussian actor requires WebGPU.";
  }
  if (engine === "webgpu" && actor.actorType === "gaussian-splat-spark") {
    return "Gaussian Splat (Spark) actor requires WebGL2.";
  }
  if (
    engine === "webgpu" &&
    actor.actorType === "plugin" &&
    (actor.pluginType === "plugin.beamCrossover.emitter" || actor.pluginType === "plugin.beamCrossover.emitterArray") &&
    actor.params.beamType === "ghost"
  ) {
    return "Beam Crossover ghost mode currently requires WebGL2.";
  }
  return null;
}
