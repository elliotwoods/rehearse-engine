import { describe, expect, it } from "vitest";
import { decodeSplatInputColor, parseSplatColorInputSpace } from "@/features/splats/colorSpace";

describe("splat color space decoding", () => {
  it("accepts Apple Log as an input space", () => {
    expect(parseSplatColorInputSpace("apple-log")).toBe("apple-log");
  });

  it("defaults unknown values to sRGB", () => {
    expect(parseSplatColorInputSpace("not-a-color-space")).toBe("srgb");
  });

  it("passes linear colors through unchanged", () => {
    expect(decodeSplatInputColor([0.1, 0.2, 0.3], "linear")).toEqual([0.1, 0.2, 0.3]);
  });

  it("decodes sRGB into linear light", () => {
    const [r, g, b] = decodeSplatInputColor([0.5, 0.5, 0.5], "srgb");
    expect(r).toBeCloseTo(0.214041, 5);
    expect(g).toBeCloseTo(0.214041, 5);
    expect(b).toBeCloseTo(0.214041, 5);
  });

  it("decodes Apple Log into a finite linear RGB triplet", () => {
    const decoded = decodeSplatInputColor([0.58, 0.42, 0.31], "apple-log");
    for (const channel of decoded) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});
