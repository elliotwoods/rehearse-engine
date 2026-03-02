export interface SplatOverlayActorState {
  actorId: string;
  assetId: string;
  assetUrl: string;
  opacity: number;
  pointSize: number;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
}

export interface SplatOverlayHandle {
  isDedicatedRenderer: boolean;
  syncActors(actors: SplatOverlayActorState[]): Promise<void>;
  setCamera(camera: any): void;
  setSize(width: number, height: number): void;
  update(): void;
  dispose(): void;
}

export class NoopSplatOverlay implements SplatOverlayHandle {
  public readonly isDedicatedRenderer = false;
  public async syncActors(_actors: SplatOverlayActorState[]): Promise<void> {}
  public setCamera(_camera: any): void {}
  public setSize(_width: number, _height: number): void {}
  public update(): void {}
  public dispose(): void {}
}

type SplatModuleCandidate = {
  Viewer?: new (...args: unknown[]) => unknown;
};

export class DedicatedGaussianSplatOverlay implements SplatOverlayHandle {
  public readonly isDedicatedRenderer = true;
  private viewer: any;
  private loaded = false;
  private readonly scenesByActorId = new Map<string, unknown>();

  public constructor(private readonly onStatus: (message: string) => void) {}

  public async initialize(): Promise<void> {
    const module = await this.loadModule();
    if (!module?.Viewer) {
      throw new Error("No supported Viewer export found in Gaussian splat renderer module.");
    }

    this.viewer = new module.Viewer({
      selfDrivenMode: false,
      useBuiltInControls: false,
      sharedMemoryForWorkers: false,
      inMemoryCompressionLevel: 1
    });

    if (typeof this.viewer.start === "function") {
      this.viewer.start();
    }
    this.loaded = true;
  }

  public async syncActors(actors: SplatOverlayActorState[]): Promise<void> {
    if (!this.loaded) {
      return;
    }

    const nextActorIds = new Set(actors.map((entry) => entry.actorId));
    for (const [actorId, handle] of this.scenesByActorId.entries()) {
      if (nextActorIds.has(actorId)) {
        continue;
      }
      this.removeScene(handle);
      this.scenesByActorId.delete(actorId);
    }

    for (const actor of actors) {
      if (!this.scenesByActorId.has(actor.actorId)) {
        const handle = await this.addScene(actor.assetUrl);
        this.scenesByActorId.set(actor.actorId, handle);
      }

      const handle = this.scenesByActorId.get(actor.actorId);
      this.applyTransform(handle, actor);
      this.applyOpacity(handle, actor.opacity);
    }
  }

  public setCamera(camera: any): void {
    if (!this.loaded) {
      return;
    }
    if (typeof this.viewer?.setCamera === "function") {
      this.viewer.setCamera(camera);
    }
  }

  public setSize(width: number, height: number): void {
    if (!this.loaded) {
      return;
    }
    if (typeof this.viewer?.setSize === "function") {
      this.viewer.setSize(width, height);
    }
  }

  public update(): void {
    if (!this.loaded) {
      return;
    }
    if (typeof this.viewer?.update === "function") {
      this.viewer.update();
    }
    if (typeof this.viewer?.render === "function") {
      this.viewer.render();
    }
  }

  public dispose(): void {
    if (!this.loaded) {
      return;
    }
    if (typeof this.viewer?.dispose === "function") {
      this.viewer.dispose();
    }
    this.scenesByActorId.clear();
    this.loaded = false;
  }

  private async loadModule(): Promise<SplatModuleCandidate | null> {
    const candidates = [
      "@mkkellogg/gaussian-splats-3d",
      "gaussian-splats-3d"
    ];

    for (const candidate of candidates) {
      try {
        const module = (await import(/* @vite-ignore */ candidate)) as SplatModuleCandidate;
        this.onStatus(`Dedicated splat renderer loaded: ${candidate}`);
        return module;
      } catch {
        // Try next candidate.
      }
    }

    this.onStatus("Dedicated splat renderer module not found, using fallback point cloud path.");
    return null;
  }

  private async addScene(url: string): Promise<unknown> {
    if (typeof this.viewer?.addSplatScene !== "function") {
      throw new Error("Gaussian splat viewer does not implement addSplatScene().");
    }
    const handle = await this.viewer.addSplatScene(url, {
      showLoadingUI: false,
      progressiveLoad: true,
      format: "ply"
    });
    return handle;
  }

  private removeScene(handle: unknown): void {
    if (typeof this.viewer?.removeSplatScene !== "function") {
      return;
    }
    try {
      this.viewer.removeSplatScene(handle);
    } catch {
      // Best effort cleanup.
    }
  }

  private applyTransform(handle: unknown, actor: SplatOverlayActorState): void {
    const maybeSetTransform = this.viewer?.setSplatSceneTransform;
    if (typeof maybeSetTransform !== "function") {
      return;
    }
    try {
      maybeSetTransform(handle, {
        position: actor.transform.position,
        rotation: actor.transform.rotation,
        scale: actor.transform.scale
      });
    } catch {
      // Some viewer implementations don't expose per-scene transforms.
    }
  }

  private applyOpacity(handle: unknown, opacity: number): void {
    const maybeSetOpacity = this.viewer?.setSplatSceneOpacity;
    if (typeof maybeSetOpacity !== "function") {
      return;
    }
    try {
      maybeSetOpacity(handle, opacity);
    } catch {
      // Optional capability.
    }
  }
}
