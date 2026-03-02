import { describe, expect, it } from "vitest";
import { createAppStore } from "@/core/store/appStore";

describe("appStore undo/redo", () => {
  it("undoes and redoes actor creation", () => {
    const store = createAppStore("web-ro");
    const initialCount = Object.keys(store.getState().state.actors).length;

    store.getState().actions.createActor({
      actorType: "empty",
      name: "Test Actor"
    });

    const countAfterCreate = Object.keys(store.getState().state.actors).length;
    expect(countAfterCreate).toBe(initialCount + 1);

    store.getState().actions.undo();
    const countAfterUndo = Object.keys(store.getState().state.actors).length;
    expect(countAfterUndo).toBe(initialCount);

    store.getState().actions.redo();
    const countAfterRedo = Object.keys(store.getState().state.actors).length;
    expect(countAfterRedo).toBe(initialCount + 1);
  });
});

