import { describe, expect, it } from "vitest";
import { parseSession, serializeSession } from "@/core/session/sessionSchema";
import { createInitialState } from "@/core/defaults";
import { SESSION_SCHEMA_VERSION } from "@/core/types";

describe("session schema", () => {
  it("serializes and parses a session payload", () => {
    const state = createInitialState("electron-rw", "demo");
    const payload = serializeSession({
      schemaVersion: SESSION_SCHEMA_VERSION,
      appMode: "electron-rw",
      sessionName: state.activeSessionName,
      createdAtIso: "2026-03-02T00:00:00.000Z",
      updatedAtIso: "2026-03-02T00:00:00.000Z",
      scene: state.scene,
      actors: state.actors,
      components: state.components,
      camera: state.camera,
      cameraBookmarks: state.cameraBookmarks,
      time: state.time,
      assets: state.assets
    });

    const parsed = parseSession(payload);
    expect(parsed.sessionName).toBe("demo");
    expect(parsed.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(Object.keys(parsed.actors).length).toBeGreaterThanOrEqual(1);
  });
});

