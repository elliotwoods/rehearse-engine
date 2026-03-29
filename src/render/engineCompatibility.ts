import type { ActorNode, RenderEngine } from "@/core/types";

export function incompatibilityReason(actor: ActorNode, engine: RenderEngine): string | null {
  if (engine === "webgpu" && actor.actorType === "mist-volume") {
    return "Mist Volume actor currently requires WebGL2.";
  }
  return null;
}
