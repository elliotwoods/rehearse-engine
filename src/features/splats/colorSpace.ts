export type SplatColorInputSpace = "linear" | "srgb" | "iphone-sdr" | "apple-log";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function srgbChannelToLinear(value: number): number {
  if (value <= 0.04045) {
    return value / 12.92;
  }
  return Math.pow((value + 0.055) / 1.055, 2.4);
}

function appleLogDecode(value: number): number {
  const r0 = -0.05641088;
  const rt = 0.01;
  const c = 47.28711236;
  const beta = 0.00964052;
  const gamma = 0.08550479;
  const delta = 0.69336945;
  const pt = c * (rt - r0) ** 2;

  if (value >= pt) {
    return 2 ** ((value - delta) / gamma) - beta;
  }
  if (value >= 0) {
    return Math.sqrt(value / c) + r0;
  }
  return r0;
}

function rec2020ToLinearSrgb(r: number, g: number, b: number): [number, number, number] {
  return [
    clamp01(1.6604962191478271 * r - 0.5876564949750909 * g - 0.0728397241727355 * b),
    clamp01(-0.12454709558601268 * r + 1.132895151076045 * g - 0.008348055490032559 * b),
    clamp01(-0.01815076335490582 * r - 0.1005973716857425 * g + 1.1187481346535225 * b)
  ];
}

export function parseSplatColorInputSpace(value: unknown): SplatColorInputSpace {
  return value === "linear" || value === "srgb" || value === "iphone-sdr" || value === "apple-log"
    ? value
    : "srgb";
}

export function decodeSplatInputColor(
  rgb: [number, number, number],
  inputSpace: SplatColorInputSpace
): [number, number, number] {
  if (inputSpace === "linear") {
    return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
  }
  if (inputSpace === "srgb" || inputSpace === "iphone-sdr") {
    return [
      clamp01(srgbChannelToLinear(rgb[0])),
      clamp01(srgbChannelToLinear(rgb[1])),
      clamp01(srgbChannelToLinear(rgb[2]))
    ];
  }
  const linear2020: [number, number, number] = [
    clamp01(appleLogDecode(rgb[0])),
    clamp01(appleLogDecode(rgb[1])),
    clamp01(appleLogDecode(rgb[2]))
  ];
  return rec2020ToLinearSrgb(linear2020[0], linear2020[1], linear2020[2]);
}
