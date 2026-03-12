/**
 * Math utilities for gaussian splat rendering.
 * Precomputes 3D covariance matrices from per-splat scale and rotation data.
 */

/**
 * Precompute the upper-triangle 3D covariance matrix for each splat.
 * Cov3D = R * diag(sx^2, sy^2, sz^2) * R^T
 *
 * Each covariance is stored as 6 floats: [c00, c01, c02, c11, c12, c22]
 * representing the symmetric matrix:
 *   [[c00, c01, c02],
 *    [c01, c11, c12],
 *    [c02, c12, c22]]
 *
 * @param scales  Float32Array [sx,sy,sz] interleaved, length = count * 3
 * @param rotations Float32Array [qx,qy,qz,qw] interleaved, length = count * 4
 * @param count  Number of splats
 * @returns Float32Array of length count * 6 (upper triangle of symmetric 3x3)
 */
export function precomputeCovariances(
  scales: Float32Array,
  rotations: Float32Array,
  count: number
): Float32Array {
  const cov = new Float32Array(count * 6);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    const i6 = i * 6;

    const sx = scales[i3];
    const sy = scales[i3 + 1];
    const sz = scales[i3 + 2];

    const qx = rotations[i4];
    const qy = rotations[i4 + 1];
    const qz = rotations[i4 + 2];
    const qw = rotations[i4 + 3];

    // Rotation matrix from quaternion (column-major convention)
    // R = [[1-2(qy²+qz²), 2(qx·qy-qz·qw), 2(qx·qz+qy·qw)],
    //      [2(qx·qy+qz·qw), 1-2(qx²+qz²), 2(qy·qz-qx·qw)],
    //      [2(qx·qz-qy·qw), 2(qy·qz+qx·qw), 1-2(qx²+qy²)]]
    const r00 = 1 - 2 * (qy * qy + qz * qz);
    const r01 = 2 * (qx * qy - qz * qw);
    const r02 = 2 * (qx * qz + qy * qw);
    const r10 = 2 * (qx * qy + qz * qw);
    const r11 = 1 - 2 * (qx * qx + qz * qz);
    const r12 = 2 * (qy * qz - qx * qw);
    const r20 = 2 * (qx * qz - qy * qw);
    const r21 = 2 * (qy * qz + qx * qw);
    const r22 = 1 - 2 * (qx * qx + qy * qy);

    // S² diagonal
    const sx2 = sx * sx;
    const sy2 = sy * sy;
    const sz2 = sz * sz;

    // Cov = R * S² * R^T
    // M = R * S² (3x3 * diagonal = column scaling)
    const m00 = r00 * sx2;
    const m01 = r01 * sy2;
    const m02 = r02 * sz2;
    const m10 = r10 * sx2;
    const m11 = r11 * sy2;
    const m12 = r12 * sz2;
    const m20 = r20 * sx2;
    const m21 = r21 * sy2;
    const m22 = r22 * sz2;

    // Cov = M * R^T (only upper triangle needed since symmetric)
    cov[i6]     = m00 * r00 + m01 * r01 + m02 * r02; // c00
    cov[i6 + 1] = m00 * r10 + m01 * r11 + m02 * r12; // c01
    cov[i6 + 2] = m00 * r20 + m01 * r21 + m02 * r22; // c02
    cov[i6 + 3] = m10 * r10 + m11 * r11 + m12 * r12; // c11
    cov[i6 + 4] = m10 * r20 + m11 * r21 + m12 * r22; // c12
    cov[i6 + 5] = m20 * r20 + m21 * r21 + m22 * r22; // c22
  }

  return cov;
}

/**
 * Compute axis-aligned bounding box from positions.
 */
export function computeBounds(positions: Float32Array, count: number): {
  min: [number, number, number];
  max: [number, number, number];
} {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = positions[i3];
    const y = positions[i3 + 1];
    const z = positions[i3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ]
  };
}
