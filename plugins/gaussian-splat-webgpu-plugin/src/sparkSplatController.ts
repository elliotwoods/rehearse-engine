import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";

type SplatColorInputSpace = "linear" | "srgb" | "iphone-sdr";

interface SyncContext {
  actor: { id: string; params: Record<string, unknown> };
  state: unknown;
  setActorStatus(status: unknown): void;
  readAssetBytes(assetId: string): Promise<Uint8Array>;
}

interface SparkColorControls {
  decodeEnabled: { value: boolean };
  colorInputSpace: { value: number };
}

function parseSparkColorInputSpace(value: unknown): SplatColorInputSpace {
  return value === "linear" || value === "iphone-sdr" || value === "srgb" ? value : "srgb";
}

function sparkColorInputSpaceCode(value: SplatColorInputSpace): number {
  if (value === "linear") {
    return 0;
  }
  if (value === "iphone-sdr") {
    return 2;
  }
  return 1;
}

function createSparkColorControls(): SparkColorControls {
  return {
    decodeEnabled: { value: false },
    colorInputSpace: { value: 1 }
  };
}

function formatLoadError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function readTonemappingMode(state: unknown): string {
  if (!state || typeof state !== "object") {
    return "off";
  }
  const scene = (state as { scene?: { tonemapping?: { mode?: unknown } } }).scene;
  const mode = scene?.tonemapping?.mode;
  return typeof mode === "string" ? mode : "off";
}

function readUnsupportedWarning(actor: { params: Record<string, unknown> }): string | null {
  const splatSizeScale = actor.params.splatSizeScale;
  if (typeof splatSizeScale === "number" && Number.isFinite(splatSizeScale) && Math.abs(splatSizeScale - 1) > 1e-6) {
    return "Splat Size is only supported in the WebGPU backend and is ignored in WebGL2.";
  }
  return null;
}

export class SparkSplatController {
  private loadedAssetId = "";
  private loadedReloadToken = 0;
  private pendingAssetId = "";
  private pendingReloadToken = 0;
  private loadToken = 0;
  private mesh: any = null;
  private correctedRoot: THREE.Group | null = null;
  private colorControls = createSparkColorControls();
  private pointCount = 0;
  private bounds: { min: [number, number, number]; max: [number, number, number] } | null = null;
  private lastWarning: string | null = null;

  public constructor(private readonly renderRoot: THREE.Group) {}

  public sync(context: SyncContext): void {
    const actor = context.actor;
    const assetId = typeof actor.params.assetId === "string" ? actor.params.assetId : "";
    const reloadToken = typeof actor.params.assetIdReloadToken === "number" ? actor.params.assetIdReloadToken : 0;

    if (!assetId) {
      if (this.loadedAssetId || this.pendingAssetId) {
        this.dispose();
        context.setActorStatus(null);
      }
      return;
    }

    if (assetId !== this.loadedAssetId || reloadToken !== this.loadedReloadToken) {
      if (assetId !== this.pendingAssetId || reloadToken !== this.pendingReloadToken) {
        this.pendingAssetId = assetId;
        this.pendingReloadToken = reloadToken;
        void this.loadAsset(assetId, reloadToken, context.readAssetBytes, context.setActorStatus);
      }
      return;
    }

    if (!this.mesh) {
      return;
    }

    this.applyRuntimeParams(actor, context.state);
    this.reportLoadedStatus(actor, context.setActorStatus);
  }

  public dispose(): void {
    this.loadToken++;
    this.loadedAssetId = "";
    this.loadedReloadToken = 0;
    this.pendingAssetId = "";
    this.pendingReloadToken = 0;
    this.disposeRenderingResources();
    this.colorControls = createSparkColorControls();
  }

  private disposeRenderingResources(): void {
    this.pointCount = 0;
    this.bounds = null;
    this.lastWarning = null;
    if (this.correctedRoot) {
      this.correctedRoot.parent?.remove(this.correctedRoot);
      this.correctedRoot = null;
    }
    if (typeof this.mesh?.dispose === "function") {
      this.mesh.dispose();
    }
    this.mesh = null;
  }

  private async loadAsset(
    assetId: string,
    reloadToken: number,
    readAssetBytes: (id: string) => Promise<Uint8Array>,
    setActorStatus: (status: unknown) => void
  ): Promise<void> {
    const localToken = ++this.loadToken;
    setActorStatus({
      values: {
        backend: "spark-webgl",
        loadState: "loading"
      },
      updatedAtIso: new Date().toISOString()
    });

    try {
      const bytes = await readAssetBytes(assetId);
      if (this.loadToken !== localToken) {
        return;
      }

      this.disposeRenderingResources();

      const correctedRoot = new THREE.Group();
      this.renderRoot.add(correctedRoot);

      const mesh = new (SplatMesh as any)({
        fileBytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      });

      if (mesh?.initialized && typeof mesh.initialized.then === "function") {
        await mesh.initialized;
      }
      if (this.loadToken !== localToken) {
        mesh.dispose?.();
        correctedRoot.parent?.remove(correctedRoot);
        return;
      }

      correctedRoot.add(mesh);
      this.loadedAssetId = assetId;
      this.loadedReloadToken = reloadToken;
      this.pendingAssetId = "";
      this.pendingReloadToken = 0;
      this.mesh = mesh;
      this.correctedRoot = correctedRoot;
      this.pointCount = Math.max(0, Math.floor(Number(mesh.numSplats ?? mesh.splatCount ?? 0)));
      const bounds = typeof mesh.getBoundingBox === "function" ? mesh.getBoundingBox() : null;
      this.bounds = bounds
        ? {
            min: [bounds.min.x, bounds.min.y, bounds.min.z],
            max: [bounds.max.x, bounds.max.y, bounds.max.z]
          }
        : null;
      setActorStatus({
        values: {
          backend: "spark-webgl",
          loadState: "loaded",
          pointCount: this.pointCount,
          boundsMin: this.bounds?.min ?? null,
          boundsMax: this.bounds?.max ?? null
        },
        updatedAtIso: new Date().toISOString()
      });
    } catch (error) {
      if (this.loadToken !== localToken) {
        return;
      }
      this.pendingAssetId = "";
      this.pendingReloadToken = 0;
      setActorStatus({
        values: {
          backend: "spark-webgl",
          loadState: "failed"
        },
        error: formatLoadError(error),
        updatedAtIso: new Date().toISOString()
      });
    }
  }

  private applyRuntimeParams(actor: { params: Record<string, unknown> }, state: unknown): void {
    if (!this.mesh) {
      return;
    }

    const scaleFactor = Number(actor.params.scaleFactor ?? 1);
    const safeScale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
    this.mesh.scale?.setScalar?.(safeScale);

    const brightness = Number(actor.params.brightness ?? 1);
    const safeBrightness = Number.isFinite(brightness) ? Math.max(0, brightness) : 1;
    if (this.mesh.recolor instanceof THREE.Color) {
      this.mesh.recolor.setRGB(safeBrightness, safeBrightness, safeBrightness);
    }

    const colorInputSpace = parseSparkColorInputSpace(actor.params.colorInputSpace);
    this.colorControls.decodeEnabled.value = readTonemappingMode(state) !== "off";
    this.colorControls.colorInputSpace.value = sparkColorInputSpaceCode(colorInputSpace);

    const opacity = Number(actor.params.opacity ?? 1);
    const safeOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
    if (typeof this.mesh.setOpacity === "function") {
      this.mesh.setOpacity(safeOpacity);
    } else {
      if (typeof this.mesh.opacity === "number") {
        this.mesh.opacity = safeOpacity;
      }
      if (this.mesh.material && "opacity" in this.mesh.material) {
        this.mesh.material.opacity = safeOpacity;
        this.mesh.material.needsUpdate = true;
      }
    }

    if (typeof this.mesh.prepareViewpoint === "function") {
      this.mesh.prepareViewpoint(this.mesh.viewpoint ?? this.mesh.defaultView);
    }
  }

  private reportLoadedStatus(actor: { params: Record<string, unknown> }, setActorStatus: (status: unknown) => void): void {
    const warning = readUnsupportedWarning(actor);
    if (warning === this.lastWarning) {
      return;
    }
    this.lastWarning = warning;
    setActorStatus({
      values: {
        backend: "spark-webgl",
        loadState: "loaded",
        pointCount: this.pointCount,
        boundsMin: this.bounds?.min ?? null,
        boundsMax: this.bounds?.max ?? null,
        warning
      },
      updatedAtIso: new Date().toISOString()
    });
  }
}
