import type { ReloadableDescriptor } from "@/core/hotReload/types";
import { DescriptorRegistry } from "@/core/hotReload/descriptorRegistry";
import type { PluginManifest } from "./contracts";

export interface PluginDefinition {
  id: string;
  name: string;
  actorDescriptors: ReloadableDescriptor[];
  componentDescriptors: ReloadableDescriptor[];
}

export interface RegisteredPlugin {
  definition: PluginDefinition;
  manifest?: PluginManifest;
}

export interface PluginApi {
  registerPlugin(plugin: PluginDefinition, manifest?: PluginManifest): void;
  listPlugins(): RegisteredPlugin[];
  registerActorType(descriptor: ReloadableDescriptor): void;
  registerComponentType(descriptor: ReloadableDescriptor): void;
}

export function createPluginApi(registry: DescriptorRegistry): PluginApi {
  const plugins = new Map<string, RegisteredPlugin>();

  return {
    registerPlugin(plugin, manifest) {
      plugins.set(plugin.id, { definition: plugin, manifest });
      for (const descriptor of plugin.actorDescriptors) {
        registry.register(descriptor);
      }
      for (const descriptor of plugin.componentDescriptors) {
        registry.register(descriptor);
      }
    },
    listPlugins() {
      return [...plugins.values()];
    },
    registerActorType(descriptor) {
      registry.register(descriptor);
    },
    registerComponentType(descriptor) {
      registry.register(descriptor);
    }
  };
}
