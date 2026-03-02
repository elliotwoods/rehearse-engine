import type { ReloadableDescriptor } from "@/core/hotReload/types";
import { EMPTY_ACTOR_SCHEMA } from "@/features/actors/actorTypes";

interface EmptyRuntime {
  tickCount: number;
}

export const emptyActorDescriptor: ReloadableDescriptor<EmptyRuntime> = {
  id: "actor.empty",
  kind: "actor",
  version: 1,
  schema: EMPTY_ACTOR_SCHEMA,
  spawn: {
    actorType: "empty",
    label: "Empty"
  },
  createRuntime: () => ({
    tickCount: 0
  }),
  updateRuntime(runtime) {
    runtime.tickCount += 1;
  }
};

