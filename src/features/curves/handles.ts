import type { CurvePoint } from "@/features/curves/types";

export interface EffectiveCurveHandles {
  handleIn: [number, number, number];
  handleOut: [number, number, number];
}

export function getEffectiveCurveHandles(point: CurvePoint): EffectiveCurveHandles {
  const inMode = point.mode === "mirrored" ? "normal" : (point.handleInMode ?? "normal");
  const outMode = point.mode === "mirrored" ? "normal" : (point.handleOutMode ?? "normal");
  return {
    handleIn: inMode === "hard" ? [0, 0, 0] : [...point.handleIn],
    handleOut: outMode === "hard" ? [0, 0, 0] : [...point.handleOut]
  };
}
