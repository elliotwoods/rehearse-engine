import type { CurveData, CurvePoint } from "@/features/curves/types";

export interface EffectiveCurveHandles {
  handleIn: [number, number, number];
  handleOut: [number, number, number];
}

function mul3(v: [number, number, number], scalar: number): [number, number, number] {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

function sub3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function getEffectiveCurveHandles(point: CurvePoint): EffectiveCurveHandles {
  const inMode = point.mode === "mirrored" ? "normal" : (point.handleInMode ?? "normal");
  const outMode = point.mode === "mirrored" ? "normal" : (point.handleOutMode ?? "normal");
  return {
    handleIn: inMode === "hard" ? [0, 0, 0] : [...point.handleIn],
    handleOut: outMode === "hard" ? [0, 0, 0] : [...point.handleOut]
  };
}

export function getEffectiveCurveHandlesAt(curve: CurveData, pointIndex: number): EffectiveCurveHandles {
  const point = curve.points[pointIndex];
  if (!point) {
    return {
      handleIn: [0, 0, 0],
      handleOut: [0, 0, 0]
    };
  }
  if (point.mode !== "auto") {
    return getEffectiveCurveHandles(point);
  }

  const pointCount = curve.points.length;
  if (pointCount <= 1) {
    return {
      handleIn: [0, 0, 0],
      handleOut: [0, 0, 0]
    };
  }

  const previous = pointIndex > 0 ? curve.points[pointIndex - 1] : null;
  const next = pointIndex < pointCount - 1 ? curve.points[pointIndex + 1] : null;

  if (!previous && next) {
    return {
      handleIn: [0, 0, 0],
      handleOut: mul3(sub3(next.position, point.position), 1 / 3)
    };
  }

  if (previous && !next) {
    return {
      handleIn: mul3(sub3(previous.position, point.position), 1 / 3),
      handleOut: [0, 0, 0]
    };
  }

  if (!previous || !next) {
    return {
      handleIn: [0, 0, 0],
      handleOut: [0, 0, 0]
    };
  }

  const tangent = mul3(sub3(next.position, previous.position), 1 / 6);
  return {
    handleIn: mul3(tangent, -1),
    handleOut: tangent
  };
}
