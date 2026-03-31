import type { ActorNode } from "@/core/types";

export function collectActorRenderOrder(
  rootActorIds: string[],
  actors: Record<string, Pick<ActorNode, "id" | "childActorIds"> | undefined>,
  getReferencedActorIds?: (actorId: string) => string[]
): string[] {
  const ordered: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (actorId: string): void => {
    if (visited.has(actorId)) {
      return;
    }
    if (visiting.has(actorId)) {
      return;
    }
    const actor = actors[actorId];
    if (!actor) {
      return;
    }
    visiting.add(actorId);
    for (const referencedActorId of getReferencedActorIds?.(actorId) ?? []) {
      if (referencedActorId !== actorId) {
        visit(referencedActorId);
      }
    }
    visited.add(actorId);
    ordered.push(actorId);
    for (const childId of actor.childActorIds) {
      visit(childId);
    }
    visiting.delete(actorId);
  };

  for (const actorId of rootActorIds) {
    visit(actorId);
  }

  return ordered;
}
