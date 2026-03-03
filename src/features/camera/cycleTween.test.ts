import { describe, expect, it } from "vitest";
import { createInitialState } from "@/core/defaults";
import {
  buildCameraCycleTargets,
  CAMERA_PRESET_ORDER,
  findCurrentCycleIndex,
  interpolateCameraState
} from "@/features/camera/cycleTween";
import type { CameraState } from "@/core/types";

describe("camera cycle tween helpers", () => {
  it("builds targets as presets first and bookmarks after", () => {
    const state = createInitialState("electron-rw");
    state.cameraBookmarks = [
      { id: "a", name: "Shot A", camera: structuredClone(state.camera) },
      { id: "b", name: "Shot B", camera: structuredClone(state.camera) }
    ];
    const targets = buildCameraCycleTargets(state);
    expect(targets.slice(0, CAMERA_PRESET_ORDER.length).every((entry) => entry.source === "preset")).toBe(true);
    expect(targets.slice(CAMERA_PRESET_ORDER.length).map((entry) => entry.id)).toEqual(["bookmark:a", "bookmark:b"]);
  });

  it("finds nearest index for current camera", () => {
    const state = createInitialState("electron-rw");
    const targets = buildCameraCycleTargets(state);
    const index = findCurrentCycleIndex(state.camera, targets);
    expect(index).toBe(0);
  });

  it("interpolates safely across mode transitions", () => {
    const from: CameraState = {
      mode: "perspective",
      position: [6, 4, 6],
      target: [0, 0, 0],
      fov: 50,
      zoom: 1,
      near: 0.01,
      far: 1000
    };
    const to: CameraState = {
      mode: "orthographic",
      position: [8, 8, 8],
      target: [0, 0, 0],
      fov: 50,
      zoom: 1,
      near: 0.01,
      far: 1000
    };
    const mid = interpolateCameraState(from, to, 0.5);
    expect(Number.isFinite(mid.position[0])).toBe(true);
    expect(Number.isFinite(mid.position[1])).toBe(true);
    expect(Number.isFinite(mid.position[2])).toBe(true);
    expect(Number.isFinite(mid.fov)).toBe(true);
    expect(Number.isFinite(mid.zoom)).toBe(true);
  });
});
