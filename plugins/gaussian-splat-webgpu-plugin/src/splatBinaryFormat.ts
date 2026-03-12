const MAGIC = new Uint8Array([0x53, 0x50, 0x4c, 0x54]); // SPLT

export interface ParsedSplatBinary {
  version: number;
  encoding: "ply";
  payload: Uint8Array;
}

export function tryParseSplatBinary(bytes: Uint8Array): ParsedSplatBinary | null {
  if (bytes.byteLength < 12) {
    return null;
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (bytes[index] !== MAGIC[index]) {
      return null;
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  const encodingByte = view.getUint8(6);
  if (encodingByte !== 1) {
    throw new Error(`Unsupported splat binary encoding byte: ${String(encodingByte)}`);
  }
  const payloadSize = view.getUint32(8, true);
  const start = 12;
  const end = start + payloadSize;
  if (end > bytes.byteLength) {
    throw new Error("Invalid splat binary payload size.");
  }
  return {
    version,
    encoding: "ply",
    payload: bytes.slice(start, end)
  };
}
