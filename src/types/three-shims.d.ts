declare module "three" {
  const THREE: any;
  export = THREE;
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  export class OrbitControls {
    public object: any;
    public target: {
      x: number;
      y: number;
      z: number;
      set(x: number, y: number, z: number): void;
    };
    public enableDamping: boolean;
    public constructor(object: any, domElement?: HTMLElement);
    public update(): void;
    public dispose(): void;
  }
}

declare module "three/examples/jsm/loaders/PLYLoader.js" {
  export class PLYLoader {
    public load(
      url: string,
      onLoad: (geometry: any) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (event: unknown) => void
    ): void;
  }
}

declare module "three/examples/jsm/loaders/RGBELoader.js" {
  export class RGBELoader {
    public load(
      url: string,
      onLoad: (texture: any) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (event: unknown) => void
    ): void;
  }
}

declare module "three/examples/jsm/loaders/KTX2Loader.js" {
  export class KTX2Loader {
    public setTranscoderPath(path: string): this;
    public load(
      url: string,
      onLoad: (texture: any) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (event: unknown) => void
    ): void;
  }
}

declare module "three/webgpu" {
  export class WebGPURenderer {
    public domElement: HTMLCanvasElement;
    public info: {
      render: {
        calls: number;
        triangles: number;
      };
    };
    public constructor(parameters?: Record<string, unknown>);
    public setPixelRatio(value: number): void;
    public setSize(width: number, height: number): void;
    public render(scene: any, camera: any): void;
    public dispose(): void;
  }
}

