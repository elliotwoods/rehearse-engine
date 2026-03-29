import { describe, expect, it } from "vitest";
import { normalizeRenderPipeFrameBytes } from "./renderPipeFrameBytes";

describe("normalizeRenderPipeFrameBytes", () => {
  it("preserves only the referenced window from a Uint8Array view", () => {
    const source = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const view = source.subarray(2, 5);

    const result = normalizeRenderPipeFrameBytes(view);

    expect(Array.from(result)).toEqual([3, 4, 5]);
  });

  it("accepts a full ArrayBuffer payload", () => {
    const source = new Uint8Array([7, 8, 9]);

    const result = normalizeRenderPipeFrameBytes(source.buffer);

    expect(Array.from(result)).toEqual([7, 8, 9]);
  });

  it("rejects malformed payloads", () => {
    expect(() => normalizeRenderPipeFrameBytes("bad" as unknown as Uint8Array)).toThrow(
      "Invalid render pipe frame payload."
    );
  });
});
