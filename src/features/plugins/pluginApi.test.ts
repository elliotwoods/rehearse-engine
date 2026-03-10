import { describe, expect, it, vi } from "vitest";
import { DescriptorRegistry } from "@/core/hotReload/descriptorRegistry";
import { createPluginApi, type PluginDefinition } from "@/features/plugins/pluginApi";

function makePlugin(version: number): PluginDefinition {
  return {
    id: "plugin.example",
    name: "Example",
    actorDescriptors: [
      {
        id: "plugin.example.actor",
        kind: "actor",
        version,
        schema: {
          id: "plugin.example.actor",
          title: "Example Actor",
          params: []
        },
        spawn: {
          actorType: "plugin",
          pluginType: "plugin.example.actor",
          label: "Example Actor"
        },
        createRuntime: () => null,
        updateRuntime: () => {}
      }
    ],
    componentDescriptors: []
  };
}

describe("createPluginApi", () => {
  it("reloads an existing plugin id instead of ignoring it", () => {
    const registry = new DescriptorRegistry();
    const hotReloadManager = {
      applyDescriptorSetUpdate: vi.fn(() => true)
    } as any;
    const api = createPluginApi(registry, hotReloadManager);

    const first = api.registerPlugin(makePlugin(1));
    const second = api.registerPlugin(makePlugin(2));

    expect(first.action).toBe("added");
    expect(second.action).toBe("reloaded");
    expect(hotReloadManager.applyDescriptorSetUpdate).toHaveBeenCalledTimes(1);
    expect(api.listPlugins()[0]?.definition.actorDescriptors[0]?.version).toBe(2);
  });
});
