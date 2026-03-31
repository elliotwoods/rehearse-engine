import { describe, expect, it } from "vitest";
import {
  assertViewportScreenshotSize,
  formatViewportScreenshotStatus,
  hasOpaquePixel
} from "@/features/render/viewportScreenshot";

describe("viewportScreenshot helpers", () => {
  it("rounds and returns a valid viewport size", () => {
    expect(assertViewportScreenshotSize(1279.6, 719.4)).toEqual({
      width: 1280,
      height: 719
    });
  });

  it("rejects zero-sized screenshots", () => {
    expect(() => assertViewportScreenshotSize(0, 240)).toThrow("Viewport screenshot is unavailable");
    expect(() => assertViewportScreenshotSize(320, 0)).toThrow("Viewport screenshot is unavailable");
  });

  it("formats a success status message with backend details", () => {
    expect(
      formatViewportScreenshotStatus({
        pngBytes: new Uint8Array(),
        width: 2560,
        height: 1440,
        backend: "webgpu"
      })
    ).toBe("Viewport screenshot copied to clipboard. 2560 x 1440 PNG | WEBGPU | debug views hidden.");
  });

  it("detects whether a screenshot contains any opaque pixels", () => {
    expect(hasOpaquePixel(new Uint8Array([0, 0, 0, 0]))).toBe(false);
    expect(hasOpaquePixel(new Uint8Array([10, 20, 30, 255]))).toBe(true);
    expect(hasOpaquePixel(new Uint8Array([0, 0, 0, 0, 10, 20, 30, 0]))).toBe(false);
  });
});
