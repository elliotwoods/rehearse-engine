export interface ViewportFullscreenShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export function isMacPlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function isViewportFullscreenShortcut(event: ViewportFullscreenShortcutEvent, macPlatform: boolean): boolean {
  if (event.repeat) {
    return false;
  }
  if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "f") {
    return false;
  }
  if (macPlatform) {
    return event.metaKey && !event.ctrlKey;
  }
  return event.ctrlKey && !event.metaKey;
}
