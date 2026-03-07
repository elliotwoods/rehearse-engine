import { describe, expect, it } from "vitest";
import { createInitialState } from "@/core/defaults";
import { estimateProjectPayloadBytes } from "@/core/project/projectSize";
import { buildProjectSnapshotManifest } from "@/core/project/projectSnapshotManifest";
import { serializeProjectSnapshot } from "@/core/project/projectSnapshotSchema";

describe("project payload size estimator", () => {
  it("matches serialized payload byte size", () => {
    const state = createInitialState("electron-rw", "demo");
    state.actors.actor_1 = {
      id: "actor_1",
      name: "Actor 1",
      enabled: true,
      kind: "actor",
      actorType: "empty",
      visibilityMode: "visible",
      parentActorId: null,
      childActorIds: [],
      componentIds: [],
      transform: {
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        scale: [1, 1, 1]
      },
      params: {}
    };

    const estimated = estimateProjectPayloadBytes(state, "electron-rw");
    const payload = serializeProjectSnapshot(buildProjectSnapshotManifest(state, "electron-rw"));
    const actual = new Blob([payload]).size;

    expect(estimated).toBe(actual);
  });
});
