/**
 * Type augmentations for Three.js TSL compute shader exports.
 *
 * The runtime module (three/build/three.tsl.js) exports these from
 * nodes/TSL.js, but @types/three's TSLBase.d.ts omits the re-exports
 * from ComputeBuiltinNode, BarrierNode, and WorkgroupInfoNode.
 *
 * NOTE: The `export {}` below is required to make this a module
 * augmentation rather than an ambient declaration that would replace
 * the existing @types/three declarations.
 */
export {};

declare module "three/tsl" {
  // ComputeBuiltinNode exports
  export const globalId: any;
  export const localId: any;
  export const workgroupId: any;
  export const numWorkgroups: any;
  export const subgroupSize: any;

  // BarrierNode exports
  export function workgroupBarrier(): any;
  export function storageBarrier(): any;
  export function textureBarrier(): any;

  // WorkgroupInfoNode exports
  export function workgroupArray(type: string, count: number): any;

  // Additional TSL types used in compute
  export function uint(value?: any): any;
  export function int(value?: any): any;
  export function bool(value?: any): any;
  export function If(condition: any, fn: () => void): any;
  export function dot(a: any, b: any): any;
}
