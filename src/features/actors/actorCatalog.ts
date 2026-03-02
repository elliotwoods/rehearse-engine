import type { AppKernel } from "@/app/kernel";
import type { ActorType } from "@/core/types";

export interface ActorCreationOption {
  descriptorId: string;
  label: string;
  actorType: ActorType;
  pluginType?: string;
  pluginBacked: boolean;
}

export function listActorCreationOptions(kernel: AppKernel): ActorCreationOption[] {
  const pluginDescriptorIds = new Set(
    kernel.pluginApi
      .listPlugins()
      .flatMap((entry) => entry.definition.actorDescriptors.map((descriptor) => descriptor.id))
  );

  return kernel.descriptorRegistry
    .listByKind("actor")
    .map((descriptor) => {
      const actorType: ActorType = descriptor.spawn?.actorType ?? "plugin";
      const pluginType = descriptor.spawn?.pluginType ?? (descriptor.spawn ? undefined : descriptor.id);
      return {
        descriptorId: descriptor.id,
        label: descriptor.spawn?.label ?? descriptor.schema.title,
        actorType,
        pluginType,
        pluginBacked: pluginDescriptorIds.has(descriptor.id)
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function createActorFromDescriptor(kernel: AppKernel, descriptorId: string): string | null {
  const option = listActorCreationOptions(kernel).find((entry) => entry.descriptorId === descriptorId);
  if (!option) {
    return null;
  }
  return kernel.store.getState().actions.createActor({
    actorType: option.actorType,
    pluginType: option.pluginType,
    name: option.label
  });
}
