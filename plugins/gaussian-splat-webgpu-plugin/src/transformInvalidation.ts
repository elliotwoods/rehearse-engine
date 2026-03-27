import * as THREE from "three";

export type ModelChangeKind = "none" | "depth-only" | "full-sort";

const POSITION_EPSILON = 1e-6;
const SCALE_EPSILON = 1e-6;
const ROTATION_EPSILON = 1e-6;

const _previousPosition = new THREE.Vector3();
const _previousQuaternion = new THREE.Quaternion();
const _previousScale = new THREE.Vector3();
const _currentPosition = new THREE.Vector3();
const _currentQuaternion = new THREE.Quaternion();
const _currentScale = new THREE.Vector3();

function nearlyEqual(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon;
}

function vectorNearlyEqual(a: THREE.Vector3, b: THREE.Vector3, epsilon: number): boolean {
  return nearlyEqual(a.x, b.x, epsilon) && nearlyEqual(a.y, b.y, epsilon) && nearlyEqual(a.z, b.z, epsilon);
}

function isPositiveUniformScaleChange(previous: THREE.Vector3, current: THREE.Vector3): boolean {
  if (previous.x <= 0 || previous.y <= 0 || previous.z <= 0) {
    return false;
  }
  if (current.x <= 0 || current.y <= 0 || current.z <= 0) {
    return false;
  }
  const ratioX = current.x / previous.x;
  const ratioY = current.y / previous.y;
  const ratioZ = current.z / previous.z;
  return nearlyEqual(ratioX, ratioY, SCALE_EPSILON) && nearlyEqual(ratioX, ratioZ, SCALE_EPSILON);
}

export function classifyWorldTransformChange(
  previousMatrix: THREE.Matrix4 | null,
  currentMatrix: THREE.Matrix4
): ModelChangeKind {
  if (!previousMatrix) {
    return "full-sort";
  }

  previousMatrix.decompose(_previousPosition, _previousQuaternion, _previousScale);
  currentMatrix.decompose(_currentPosition, _currentQuaternion, _currentScale);

  const rotationChanged =
    1 - Math.abs(_previousQuaternion.dot(_currentQuaternion)) > ROTATION_EPSILON;
  if (rotationChanged) {
    return "full-sort";
  }

  const scaleChanged = !vectorNearlyEqual(_previousScale, _currentScale, SCALE_EPSILON);
  if (scaleChanged) {
    return isPositiveUniformScaleChange(_previousScale, _currentScale) ? "depth-only" : "full-sort";
  }

  const positionChanged = !vectorNearlyEqual(_previousPosition, _currentPosition, POSITION_EPSILON);
  return positionChanged ? "depth-only" : "none";
}
