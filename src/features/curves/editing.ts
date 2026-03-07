import type { CurveData, CurveHandleMode, CurveHandleWeightMode, CurvePoint } from "@/features/curves/types";
import { getEffectiveCurveHandlesAt } from "@/features/curves/handles";

function add3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul3(v: [number, number, number], scalar: number): [number, number, number] {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

function sub3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function norm3(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const magnitude = norm3(v);
  if (magnitude <= 1e-9) {
    return [1, 0, 0];
  }
  return [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude];
}

function cloneCurvePoint(point: CurvePoint): CurvePoint {
  return {
    position: [...point.position],
    handleIn: [...point.handleIn],
    handleOut: [...point.handleOut],
    mode: point.mode,
    handleInMode: point.handleInMode ?? "normal",
    handleOutMode: point.handleOutMode ?? "normal",
    enabled: point.enabled !== false
  };
}

function cloneCurveData(curve: CurveData): CurveData {
  return {
    closed: curve.closed,
    points: curve.points.map((point) => cloneCurvePoint(point))
  };
}

export function appendCurvePoint(curve: CurveData, position?: [number, number, number]): CurveData {
  const next = cloneCurveData(curve);
  const last = next.points[next.points.length - 1] ?? {
    position: [0, 0, 0] as [number, number, number],
    handleIn: [-0.3, 0, 0] as [number, number, number],
    handleOut: [0.3, 0, 0] as [number, number, number],
    mode: "mirrored" as const,
    handleInMode: "normal" as const,
    handleOutMode: "normal" as const,
    enabled: true
  };

  const nextPosition = position ?? add3(last.position, [1, 0, 0]);
  next.points.push({
    position: nextPosition,
    handleIn: [-0.3, 0, 0],
    handleOut: [0.3, 0, 0],
    mode: "mirrored",
    handleInMode: "normal",
    handleOutMode: "normal",
    enabled: true
  });
  return next;
}

export function duplicateCurvePoint(curve: CurveData, pointIndex: number): CurveData {
  const next = cloneCurveData(curve);
  const point = next.points[pointIndex];
  if (!point) {
    return next;
  }
  next.points.splice(pointIndex + 1, 0, cloneCurvePoint(point));
  return next;
}

export function setCurvePointEnabled(curve: CurveData, pointIndex: number, enabled: boolean): CurveData {
  const next = cloneCurveData(curve);
  const point = next.points[pointIndex];
  if (!point) {
    return next;
  }
  point.enabled = enabled;
  return next;
}

export function removeCurvePoint(curve: CurveData, pointIndex: number): CurveData {
  const next = cloneCurveData(curve);
  if (pointIndex < 0 || pointIndex >= next.points.length) {
    return next;
  }
  next.points.splice(pointIndex, 1);
  return next;
}

export function setCurveAnchorPosition(curve: CurveData, pointIndex: number, position: [number, number, number]): CurveData {
  const next = cloneCurveData(curve);
  const point = next.points[pointIndex];
  if (!point) {
    return next;
  }
  point.position = [...position];
  return next;
}

export function setCurvePointMode(curve: CurveData, pointIndex: number, mode: CurveHandleMode): CurveData {
  const next = cloneCurveData(curve);
  const point = next.points[pointIndex];
  if (!point) {
    return next;
  }
  if (point.mode === mode) {
    return next;
  }

  const effectiveHandles = getEffectiveCurveHandlesAt(next, pointIndex);
  point.handleIn = [...effectiveHandles.handleIn];
  point.handleOut = [...effectiveHandles.handleOut];

  if (mode === "mirrored" && point.mode !== "mirrored") {
    const mirroredOut = mul3(sub3(point.handleOut, point.handleIn), 0.5);
    point.handleOut = mirroredOut;
    point.handleIn = mul3(mirroredOut, -1);
    point.handleInMode = "normal";
    point.handleOutMode = "normal";
  }

  if (mode === "hard") {
    point.handleInMode = "hard";
    point.handleOutMode = "hard";
    point.mode = "normal";
    return next;
  }

  point.handleInMode = "normal";
  point.handleOutMode = "normal";
  point.mode = mode;
  return next;
}

export function setCurveHandleWeightMode(
  curve: CurveData,
  pointIndex: number,
  handleKind: "in" | "out",
  mode: CurveHandleWeightMode
): CurveData {
  const next = cloneCurveData(curve);
  const point = next.points[pointIndex];
  if (!point) {
    return next;
  }
  if (point.mode === "mirrored" || point.mode === "auto") {
    return next;
  }
  if (handleKind === "in") {
    point.handleInMode = mode;
  } else {
    point.handleOutMode = mode;
  }
  return next;
}

export function setCurveHandlePosition(
  curve: CurveData,
  pointIndex: number,
  handleKind: "in" | "out",
  position: [number, number, number]
): CurveData {
  const next = cloneCurveData(curve);
  const point = next.points[pointIndex];
  if (!point) {
    return next;
  }

  if (point.mode === "auto") {
    const effectiveHandles = getEffectiveCurveHandlesAt(next, pointIndex);
    point.mode = "normal";
    point.handleInMode = "normal";
    point.handleOutMode = "normal";
    point.handleIn = [...effectiveHandles.handleIn];
    point.handleOut = [...effectiveHandles.handleOut];
  }

  if (handleKind === "in") {
    point.handleIn = [...position];
  } else {
    point.handleOut = [...position];
  }

  const edited = handleKind === "in" ? point.handleIn : point.handleOut;
  const editedLength = norm3(edited);

  if (point.mode === "normal") {
    const editedMode = handleKind === "in" ? point.handleInMode : point.handleOutMode;
    if (editedMode === "hard") {
      return next;
    }
    return next;
  }

  if (point.mode === "mirrored") {
    if (editedLength <= 1e-9) {
      if (handleKind === "in") {
        point.handleOut = [0, 0, 0];
      } else {
        point.handleIn = [0, 0, 0];
      }
      return next;
    }
    const mirrored = mul3(normalize3(edited), -editedLength);
    if (handleKind === "in") {
      point.handleOut = mirrored;
    } else {
      point.handleIn = mirrored;
    }
    return next;
  }

  return next;
}
