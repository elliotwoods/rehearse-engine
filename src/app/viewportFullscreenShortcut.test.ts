import { describe, expect, it } from "vitest";
import { isMacPlatform, isViewportFullscreenShortcut, type ViewportFullscreenShortcutEvent } from "@/app/viewportFullscreenShortcut";

function createShortcutEvent(partial: Partial<ViewportFullscreenShortcutEvent> = {}): ViewportFullscreenShortcutEvent {
  return {
    key: "f",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...partial
  };
}

describe("viewport fullscreen shortcut", () => {
  it("matches Cmd+F on mac platforms", () => {
    expect(isViewportFullscreenShortcut(createShortcutEvent({ metaKey: true }), true)).toBe(true);
    expect(isViewportFullscreenShortcut(createShortcutEvent({ ctrlKey: true }), true)).toBe(false);
  });

  it("matches Ctrl+F on non-mac platforms", () => {
    expect(isViewportFullscreenShortcut(createShortcutEvent({ ctrlKey: true }), false)).toBe(true);
    expect(isViewportFullscreenShortcut(createShortcutEvent({ metaKey: true }), false)).toBe(false);
  });

  it("rejects modified or repeated variants", () => {
    expect(isViewportFullscreenShortcut(createShortcutEvent({ altKey: true, ctrlKey: true }), false)).toBe(false);
    expect(isViewportFullscreenShortcut(createShortcutEvent({ shiftKey: true, metaKey: true }), true)).toBe(false);
    expect(isViewportFullscreenShortcut(createShortcutEvent({ repeat: true, ctrlKey: true }), false)).toBe(false);
    expect(isViewportFullscreenShortcut(createShortcutEvent({ key: "g", ctrlKey: true }), false)).toBe(false);
  });

  it("detects mac platforms from navigator-style platform strings", () => {
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(isMacPlatform("Win32")).toBe(false);
  });
});
