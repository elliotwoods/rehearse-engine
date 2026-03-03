import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";
import type { AppKernel } from "@/app/kernel";
import type { ActorNode } from "@/core/types";
import { SceneController } from "@/render/sceneController";

const SPARK_COORDINATE_CORRECTION_EULER = new THREE.Euler(-Math.PI / 2, 0, 0, "XYZ");

interface SparkActorEntry {
  assetId: string;
  reloadToken: number;
  mesh: any;
  correctedRoot: any;
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

export class SparkSplatController {
  private readonly entriesByActorId = new Map<string, SparkActorEntry>();
  private loadingTokenByActorId = new Map<string, number>();

  public constructor(
    private readonly kernel: AppKernel,
    private readonly sceneController: SceneController
  ) {}

  public async syncFromState(): Promise<void> {
    const state = this.kernel.store.getState().state;
    const sparkActors = Object.values(state.actors).filter((actor) => actor.actorType === "gaussian-splat-spark");
    const sparkActorIds = new Set(sparkActors.map((actor) => actor.id));

    for (const existingActorId of [...this.entriesByActorId.keys()]) {
      if (!sparkActorIds.has(existingActorId)) {
        this.disposeActorEntry(existingActorId);
      }
    }

    for (const actor of sparkActors) {
      await this.syncSparkActor(actor);
    }
  }

  public getRenderStats(): { drawCalls: number; visibleCount: number; actorCount: number } {
    let visibleCount = 0;
    for (const entry of this.entriesByActorId.values()) {
      visibleCount += Math.max(0, Math.floor(Number(entry.mesh?.numSplats ?? 0)));
    }
    return {
      drawCalls: this.entriesByActorId.size,
      visibleCount,
      actorCount: this.entriesByActorId.size
    };
  }

  public dispose(): void {
    for (const actorId of [...this.entriesByActorId.keys()]) {
      this.disposeActorEntry(actorId);
    }
    this.loadingTokenByActorId = new Map<string, number>();
  }

  private async syncSparkActor(actor: ActorNode): Promise<void> {
    const actorObject = this.sceneController.getActorObject(actor.id);
    if (!(actorObject instanceof THREE.Group)) {
      return;
    }

    const assetId = typeof actor.params.assetId === "string" ? actor.params.assetId : "";
    const reloadToken = typeof actor.params.assetIdReloadToken === "number" ? actor.params.assetIdReloadToken : 0;
    const existingEntry = this.entriesByActorId.get(actor.id);

    if (!assetId) {
      this.disposeActorEntry(actor.id);
      this.kernel.store.getState().actions.setActorStatus(actor.id, null);
      return;
    }

    const activeSessionName = this.kernel.store.getState().state.activeSessionName;
    const asset = this.kernel.store.getState().state.assets.find((entry) => entry.id === assetId);
    if (!asset) {
      this.kernel.store.getState().actions.setActorStatus(actor.id, {
        values: {
          backend: "spark-webgl",
          loadState: "failed"
        },
        error: "Asset reference not found in session state.",
        updatedAtIso: new Date().toISOString()
      });
      return;
    }

    const isLoaded =
      existingEntry && existingEntry.assetId === assetId && existingEntry.reloadToken === reloadToken && existingEntry.mesh;
    if (isLoaded) {
      this.applySparkRuntimeParams(existingEntry.mesh, actor);
      return;
    }

    const loadToken = (this.loadingTokenByActorId.get(actor.id) ?? 0) + 1;
    this.loadingTokenByActorId.set(actor.id, loadToken);
    this.kernel.store.getState().actions.setActorStatus(actor.id, {
      values: {
        backend: "spark-webgl",
        loadState: "loading",
        assetFileName: asset.sourceFileName
      },
      updatedAtIso: new Date().toISOString()
    });

    try {
      const bytes = await this.kernel.storage.readAssetBytes({
        sessionName: activeSessionName,
        relativePath: asset.relativePath
      });
      if (this.loadingTokenByActorId.get(actor.id) !== loadToken) {
        return;
      }
      this.disposeActorEntry(actor.id);

      const correctedRoot = new THREE.Group();
      correctedRoot.rotation.copy(SPARK_COORDINATE_CORRECTION_EULER);
      actorObject.add(correctedRoot);
      const mesh = new (SplatMesh as any)({
        fileBytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      });

      if (mesh?.initialized && typeof mesh.initialized.then === "function") {
        await mesh.initialized;
      }
      if (this.loadingTokenByActorId.get(actor.id) !== loadToken) {
        mesh.dispose?.();
        correctedRoot.parent?.remove(correctedRoot);
        return;
      }

      correctedRoot.add(mesh);
      this.applySparkRuntimeParams(mesh, actor);

      const bounds = typeof mesh.getBoundingBox === "function" ? mesh.getBoundingBox() : null;
      const pointCount = Number(mesh.numSplats ?? mesh.splatCount ?? 0);
      this.entriesByActorId.set(actor.id, {
        assetId,
        reloadToken,
        mesh,
        correctedRoot
      });
      this.kernel.store.getState().actions.setActorStatus(actor.id, {
        values: {
          backend: "spark-webgl",
          loadState: "loaded",
          assetFileName: asset.sourceFileName,
          pointCount,
          boundsMin: bounds ? [bounds.min.x, bounds.min.y, bounds.min.z] : undefined,
          boundsMax: bounds ? [bounds.max.x, bounds.max.y, bounds.max.z] : undefined
        },
        updatedAtIso: new Date().toISOString()
      });
      this.kernel.store.getState().actions.setStatus(
        `Gaussian splat loaded (Spark): ${asset.sourceFileName} | points: ${pointCount.toLocaleString()}`
      );
    } catch (error) {
      if (this.loadingTokenByActorId.get(actor.id) !== loadToken) {
        return;
      }
      this.disposeActorEntry(actor.id);
      const message = formatLoadError(error);
      this.kernel.store.getState().actions.setActorStatus(actor.id, {
        values: {
          backend: "spark-webgl",
          loadState: "failed",
          assetFileName: asset.sourceFileName
        },
        error: message,
        updatedAtIso: new Date().toISOString()
      });
      this.kernel.store.getState().actions.setStatus(`Gaussian splat load failed (Spark): ${asset.sourceFileName} (${message})`);
    }
  }

  private disposeActorEntry(actorId: string): void {
    const existing = this.entriesByActorId.get(actorId);
    if (!existing) {
      return;
    }
    existing.correctedRoot.parent?.remove(existing.correctedRoot);
    if (typeof existing.mesh?.dispose === "function") {
      existing.mesh.dispose();
    }
    this.entriesByActorId.delete(actorId);
  }

  private applySparkRuntimeParams(mesh: any, actor: ActorNode): void {
    const scaleFactor = Number(actor.params.scaleFactor ?? 1);
    const safeScale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
    mesh.scale?.setScalar?.(safeScale);
    const opacity = Number(actor.params.opacity ?? 1);
    const safeOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
    if (typeof mesh.setOpacity === "function") {
      mesh.setOpacity(safeOpacity);
      return;
    }
    if (typeof mesh.opacity === "number") {
      mesh.opacity = safeOpacity;
    }
    if (mesh.material && "opacity" in mesh.material) {
      mesh.material.opacity = safeOpacity;
      mesh.material.transparent = safeOpacity < 1;
      mesh.material.needsUpdate = true;
    }
  }
}
