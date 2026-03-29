export function normalizeRenderPipeFrameBytes(framePngBytes: Uint8Array | ArrayBuffer): Buffer {
  if (framePngBytes instanceof Uint8Array) {
    return Buffer.from(framePngBytes.buffer, framePngBytes.byteOffset, framePngBytes.byteLength);
  }
  if (framePngBytes instanceof ArrayBuffer) {
    return Buffer.from(framePngBytes);
  }
  throw new Error("Invalid render pipe frame payload.");
}
