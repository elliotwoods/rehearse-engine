import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { AppKernel } from "@/app/kernel";
import type { ActorNode } from "@/core/types";

export class SceneController {
  public readonly scene = new THREE.Scene();
  private readonly actorObjects = new Map<string, any>();
  private readonly plyLoader = new PLYLoader();
  private readonly rgbeLoader = new RGBELoader();
  private readonly ktx2Loader = new KTX2Loader();
  private currentEnvironmentAssetId: string | null = null;
  private renderGaussianSplatFallback = true;

  public constructor(private readonly kernel: AppKernel) {
    this.scene.background = new THREE.Color("#070b12");
    const grid = new THREE.GridHelper(20, 20, 0x2f8f9d, 0x1f2430);
    (grid.material as any).transparent = true;
    (grid.material as any).opacity = 0.35;
    this.scene.add(grid);
    this.scene.add(new THREE.AxesHelper(2.5));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(8, 12, 6);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    this.ktx2Loader.setTranscoderPath("/basis/");
  }

  public async syncFromState(): Promise<void> {
    const state = this.kernel.store.getState().state;
    const actorIds = new Set(Object.keys(state.actors));

    for (const existing of [...this.actorObjects.keys()]) {
      if (!actorIds.has(existing)) {
        const object = this.actorObjects.get(existing);
        if (object) {
          this.scene.remove(object);
        }
        this.actorObjects.delete(existing);
      }
    }

    for (const actor of Object.values(state.actors)) {
      if (actor.actorType === "gaussian-splat" && !this.renderGaussianSplatFallback) {
        const existing = this.actorObjects.get(actor.id);
        if (existing) {
          this.scene.remove(existing);
          this.actorObjects.delete(actor.id);
        }
        continue;
      }
      await this.ensureActorObject(actor);
      this.applyActorTransform(actor);
    }

    await this.updateEnvironmentTexture();
  }

  public setGaussianSplatFallbackEnabled(enabled: boolean): void {
    this.renderGaussianSplatFallback = enabled;
  }

  private async ensureActorObject(actor: ActorNode): Promise<void> {
    if (!this.actorObjects.has(actor.id)) {
      const object = await this.createObjectForActor(actor);
      this.actorObjects.set(actor.id, object);
      this.scene.add(object);
    }
  }

  private async createObjectForActor(actor: ActorNode): Promise<any> {
    if (actor.actorType === "gaussian-splat") {
      const points = new THREE.Points(
        new THREE.BufferGeometry(),
        new THREE.PointsMaterial({
          size: Number(actor.params.pointSize ?? 0.02),
          color: 0x8bd3ff,
          transparent: true,
          opacity: Number(actor.params.opacity ?? 1)
        })
      );
      const assetId = typeof actor.params.assetId === "string" ? actor.params.assetId : undefined;
      if (assetId) {
        const asset = this.kernel.store.getState().state.assets.find((entry) => entry.id === assetId);
        if (asset) {
          const url = await this.kernel.storage.resolveAssetPath({
            sessionName: this.kernel.store.getState().state.activeSessionName,
            relativePath: asset.relativePath
          });
          this.plyLoader.load(
            url,
            (geometry) => {
              geometry.computeVertexNormals();
              points.geometry.dispose();
              points.geometry = geometry;
            },
            undefined,
            () => {
              // Keep a valid placeholder if parsing fails.
            }
          );
        }
      }
      return points;
    }

    if (actor.actorType === "environment") {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.15),
        new THREE.MeshStandardMaterial({ color: 0x33ffaa, emissive: 0x112222 })
      );
      return marker;
    }

    if (actor.actorType === "plugin") {
      return new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.25, 0.25),
        new THREE.MeshStandardMaterial({ color: 0xfa9a00 })
      );
    }

    return new THREE.Group();
  }

  private applyActorTransform(actor: ActorNode): void {
    const object = this.actorObjects.get(actor.id);
    if (!object) {
      return;
    }
    object.visible = actor.enabled;
    object.position.set(...actor.transform.position);
    object.rotation.set(...actor.transform.rotation);
    object.scale.set(...actor.transform.scale);
  }

  private async updateEnvironmentTexture(): Promise<void> {
    const state = this.kernel.store.getState().state;
    const environmentActor = Object.values(state.actors).find((actor) => actor.actorType === "environment");
    if (!environmentActor) {
      if (this.currentEnvironmentAssetId) {
        this.scene.environment = null;
        this.scene.background = new THREE.Color("#070b12");
        this.currentEnvironmentAssetId = null;
      }
      return;
    }

    const assetId = typeof environmentActor.params.assetId === "string" ? environmentActor.params.assetId : null;
    if (!assetId || assetId === this.currentEnvironmentAssetId) {
      return;
    }

    const asset = state.assets.find((entry) => entry.id === assetId);
    if (!asset) {
      return;
    }
    const url = await this.kernel.storage.resolveAssetPath({
      sessionName: state.activeSessionName,
      relativePath: asset.relativePath
    });

    const extension = asset.relativePath.split(".").pop()?.toLowerCase();
    if (extension === "ktx2") {
      this.ktx2Loader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.scene.environment = texture;
          this.scene.background = texture;
          this.currentEnvironmentAssetId = asset.id;
        },
        undefined,
        () => {
          this.kernel.store.getState().actions.setStatus(
            "KTX2 environment load failed. Ensure basis transcoder files are available in /public/basis."
          );
        }
      );
      return;
    }

    this.rgbeLoader.load(
      url,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = texture;
        this.scene.background = texture;
        this.currentEnvironmentAssetId = asset.id;
      },
      undefined,
      () => {
        this.kernel.store.getState().actions.setStatus("Environment texture load failed.");
      }
    );
  }
}
