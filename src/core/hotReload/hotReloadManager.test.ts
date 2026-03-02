import { describe, expect, it } from "vitest";
import { DescriptorRegistry } from "@/core/hotReload/descriptorRegistry";
import { HotReloadManager } from "@/core/hotReload/hotReloadManager";
import { createAppStore } from "@/core/store/appStore";
import type { ReloadableDescriptor } from "@/core/hotReload/types";

const descriptorV1: ReloadableDescriptor = {
  id: "actor.test",
  kind: "actor",
  version: 1,
  schema: {
    id: "actor.test.schema",
    title: "Test",
    params: []
  },
  createRuntime: () => ({}),
  updateRuntime: () => {}
};

const descriptorV2: ReloadableDescriptor = {
  ...descriptorV1,
  version: 2
};

describe("hot reload manager", () => {
  it("replaces descriptors and emits applied event", () => {
    const registry = new DescriptorRegistry();
    const store = createAppStore("web-ro");
    const manager = new HotReloadManager(registry, store);
    const events: { applied: boolean }[] = [];
    manager.subscribe((event) => events.push({ applied: event.applied }));

    manager.applyModuleUpdate("module-x", [descriptorV1]);
    manager.applyModuleUpdate("module-x", [descriptorV2]);

    expect(registry.get("actor.test")?.version).toBe(2);
    expect(events.length).toBe(2);
    expect(events.every((event) => event.applied)).toBe(true);
  });
});

