import type { ReloadableDescriptor } from "@/core/hotReload/types";
import { DescriptorRegistry } from "@/core/hotReload/descriptorRegistry";
import type { HotReloadManager } from "@/core/hotReload/hotReloadManager";
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
  source?: {
    modulePath: string;
    sourceGroup?: "plugins-local" | "plugins" | "manual";
    loadedAtIso: string;
    updatedAtMs?: number;
  };
  lastLoadedAtIso: string;
  reloadCount: number;
}

export interface PluginRegistrationResult {
  action: "added" | "reloaded";
  plugin: RegisteredPlugin;
}

export interface PluginApi {
  registerPlugin(
    plugin: PluginDefinition,
    manifest?: PluginManifest,
    source?: RegisteredPlugin["source"]
  ): PluginRegistrationResult;
  listPlugins(): RegisteredPlugin[];
  getPluginByModulePath(modulePath: string): RegisteredPlugin | null;
  subscribe(listener: () => void): () => void;
  getRevision(): number;
  registerActorType(descriptor: ReloadableDescriptor): void;
  registerComponentType(descriptor: ReloadableDescriptor): void;
}

export function createPluginApi(registry: DescriptorRegistry, hotReloadManager: HotReloadManager): PluginApi {
  const plugins = new Map<string, RegisteredPlugin>();
  const listeners = new Set<() => void>();
  let revision = 0;

  const emit = () => {
    revision += 1;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    registerPlugin(plugin, manifest, source) {
      const existing = plugins.get(plugin.id);
      const loadedAtIso = new Date().toISOString();
      const registeredPlugin: RegisteredPlugin = {
        definition: plugin,
        manifest,
        source: source
          ? {
              ...source,
              loadedAtIso
            }
          : undefined,
        lastLoadedAtIso: loadedAtIso,
        reloadCount: existing ? existing.reloadCount + 1 : 0
      };
      if (existing) {
        const applied = hotReloadManager.applyDescriptorSetUpdate(
          source?.modulePath ?? `plugin:${plugin.id}`,
          [
            ...existing.definition.actorDescriptors.map((descriptor) => descriptor.id),
            ...existing.definition.componentDescriptors.map((descriptor) => descriptor.id)
          ],
          [
          ...plugin.actorDescriptors,
          ...plugin.componentDescriptors
          ]
        );
        if (!applied) {
          return {
            action: "reloaded",
            plugin: existing
          };
        }
        plugins.set(plugin.id, registeredPlugin);
        emit();
        return {
          action: "reloaded",
          plugin: registeredPlugin
        };
      }
      plugins.set(plugin.id, registeredPlugin);
      for (const descriptor of plugin.actorDescriptors) {
        registry.register(descriptor);
      }
      for (const descriptor of plugin.componentDescriptors) {
        registry.register(descriptor);
      }
      emit();
      return {
        action: "added",
        plugin: registeredPlugin
      };
    },
    listPlugins() {
      return [...plugins.values()];
    },
    getPluginByModulePath(modulePath) {
      for (const entry of plugins.values()) {
        if (entry.source?.modulePath === modulePath) {
          return entry;
        }
      }
      return null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getRevision() {
      return revision;
    },
    registerActorType(descriptor) {
      registry.register(descriptor);
      emit();
    },
    registerComponentType(descriptor) {
      registry.register(descriptor);
      emit();
    }
  };
}
