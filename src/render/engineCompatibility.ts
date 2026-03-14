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
  if (
    engine === "webgpu" &&
    actor.actorType === "plugin" &&
    (actor.pluginType === "plugin.beamCrossover.emitter" || actor.pluginType === "plugin.beamCrossover.emitterArray") &&
    (actor.params.beamType === "ghost" || actor.params.beamType === "scatteringShell" || actor.params.beamType === "scatteringShell2")
  ) {
    if (actor.params.beamType === "scatteringShell") {
      return "Beam Crossover Scattering Shell mode currently requires WebGL2.";
    }
    if (actor.params.beamType === "scatteringShell2") {
      return "Beam Crossover Scattering Shell 2 mode currently requires WebGL2.";
    }
    return "Beam Crossover ghost mode currently requires WebGL2.";
  }
  return null;
}
