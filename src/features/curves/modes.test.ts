import { describe, expect, it } from "vitest";
import { getEffectiveCurveHandles, getEffectiveCurveHandlesAt } from "@/features/curves/handles";
import { removeCurvePoint, setCurveHandlePosition, setCurveHandleWeightMode, setCurvePointMode } from "@/features/curves/editing";
import { sanitizeCurveData, type CurveData } from "@/features/curves/types";

const curve: CurveData = {
  closed: false,
  points: [
    {
      position: [0, 0, 0],
      handleIn: [-1, 0, 0],
      handleOut: [1, 0, 0],
      mode: "mirrored",
      handleInMode: "normal",
      handleOutMode: "normal"
    },
    {
      position: [2, 0, 0],
      handleIn: [-1, 0, 0],
      handleOut: [1, 0, 0],
      mode: "mirrored",
      handleInMode: "normal",
      handleOutMode: "normal"
    }
  ]
};

function expectVecClose(actual: [number, number, number] | undefined, expected: [number, number, number]): void {
  expect(actual?.[0]).toBeCloseTo(expected[0], 6);
  expect(actual?.[1]).toBeCloseTo(expected[1], 6);
  expect(actual?.[2]).toBeCloseTo(expected[2], 6);
}

describe("curve handle modes", () => {
  it("maps legacy modes to normal", () => {
    const freeCurve = sanitizeCurveData({
      closed: false,
      points: [{ position: [0, 0, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "free" }]
    });
    const alignedCurve = sanitizeCurveData({
      closed: false,
      points: [{ position: [0, 0, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "aligned" }]
    });
    expect(freeCurve.points[0]?.mode).toBe("normal");
    expect(alignedCurve.points[0]?.mode).toBe("normal");
  });

  it("mirrored mode keeps handles symmetric while editing", () => {
    const edited = setCurveHandlePosition(curve, 0, "out", [2, 3, 0]);
    expectVecClose(edited.points[0]?.handleOut, [2, 3, 0]);
    expectVecClose(edited.points[0]?.handleIn, [-2, -3, 0]);
  });

  it("normal mode allows independent handles", () => {
    const normalCurve = setCurvePointMode(curve, 0, "normal");
    const edited = setCurveHandlePosition(normalCurve, 0, "out", [3, 0, 0]);
    expectVecClose(edited.points[0]?.handleOut, [3, 0, 0]);
    expectVecClose(edited.points[0]?.handleIn, [-1, 0, 0]);
  });

  it("hard mode keeps stored handles but exposes zero effective handles", () => {
    const hardCurve = setCurvePointMode(curve, 0, "hard");
    const point = hardCurve.points[0];
    expect(point?.mode).toBe("normal");
    expect(point?.handleInMode).toBe("hard");
    expect(point?.handleOutMode).toBe("hard");
    expectVecClose(point?.handleIn, [-1, 0, 0]);
    expectVecClose(point?.handleOut, [1, 0, 0]);
    expectVecClose(point ? getEffectiveCurveHandles(point).handleIn : undefined, [0, 0, 0]);
    expectVecClose(point ? getEffectiveCurveHandles(point).handleOut : undefined, [0, 0, 0]);
  });

  it("normal to mirrored symmetrizes using both handles", () => {
    const normalCurve = setCurvePointMode(curve, 0, "normal");
    const withIndependent = setCurveHandlePosition(normalCurve, 0, "in", [-4, 1, 0]);
    const mirrored = setCurvePointMode(withIndependent, 0, "mirrored");
    expectVecClose(mirrored.points[0]?.handleOut, [2.5, -0.5, 0]);
    expectVecClose(mirrored.points[0]?.handleIn, [-2.5, 0.5, 0]);
  });

  it("supports independent hard/normal handle modes", () => {
    const normalCurve = setCurvePointMode(curve, 0, "normal");
    const hardenedIn = setCurveHandleWeightMode(normalCurve, 0, "in", "hard");
    const point = hardenedIn.points[0];
    expect(point?.mode).toBe("normal");
    expect(point?.handleInMode).toBe("hard");
    expect(point?.handleOutMode).toBe("normal");
    expectVecClose(point ? getEffectiveCurveHandles(point).handleIn : undefined, [0, 0, 0]);
    expectVecClose(point ? getEffectiveCurveHandles(point).handleOut : undefined, [1, 0, 0]);
  });

  it("resolves auto mode handles from adjacent points", () => {
    const autoCurve = sanitizeCurveData({
      closed: false,
      points: [
        { position: [0, 0, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "auto" },
        { position: [3, 3, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "auto" },
        { position: [6, 0, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "auto" }
      ]
    });

    expectVecClose(getEffectiveCurveHandlesAt(autoCurve, 0).handleIn, [0, 0, 0]);
    expectVecClose(getEffectiveCurveHandlesAt(autoCurve, 0).handleOut, [1, 1, 0]);
    expectVecClose(getEffectiveCurveHandlesAt(autoCurve, 1).handleIn, [-1, 0, 0]);
    expectVecClose(getEffectiveCurveHandlesAt(autoCurve, 1).handleOut, [1, 0, 0]);
    expectVecClose(getEffectiveCurveHandlesAt(autoCurve, 2).handleIn, [-1, 1, 0]);
    expectVecClose(getEffectiveCurveHandlesAt(autoCurve, 2).handleOut, [0, 0, 0]);
  });

  it("promotes auto mode to normal when a handle is edited directly", () => {
    const autoCurve = sanitizeCurveData({
      closed: false,
      points: [
        { position: [0, 0, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "auto" },
        { position: [3, 0, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "auto" },
        { position: [6, 0, 0], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "auto" }
      ]
    });

    const edited = setCurveHandlePosition(autoCurve, 1, "out", [2, 1, 0]);
    expect(edited.points[1]?.mode).toBe("normal");
    expectVecClose(edited.points[1]?.handleIn, [-1, 0, 0]);
    expectVecClose(edited.points[1]?.handleOut, [2, 1, 0]);
  });

  it("keeps explicit empty and single-point curves during sanitize", () => {
    const emptyCurve = sanitizeCurveData({ closed: false, points: [] });
    const onePointCurve = sanitizeCurveData({
      closed: false,
      points: [{ position: [3, 4, 5], handleIn: [0, 0, 0], handleOut: [0, 0, 0], mode: "mirrored" }]
    });
    expect(emptyCurve.points).toHaveLength(0);
    expect(onePointCurve.points).toHaveLength(1);
    expect(onePointCurve.points[0]?.position).toEqual([3, 4, 5]);
  });

  it("allows removing curve points down to zero", () => {
    const afterFirstDelete = removeCurvePoint(curve, 1);
    const afterSecondDelete = removeCurvePoint(afterFirstDelete, 0);
    expect(afterFirstDelete.points).toHaveLength(1);
    expect(afterSecondDelete.points).toHaveLength(0);
  });
});
