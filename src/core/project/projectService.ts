import { createInitialState } from "@/core/defaults";
import { buildProjectSnapshotManifest } from "@/core/project/projectSnapshotManifest";
import { parseProjectSnapshot, serializeProjectSnapshot } from "@/core/project/projectSnapshotSchema";
import type { StorageAdapter } from "@/features/storage/storageAdapter";
import type { AppStoreApi } from "@/core/store/appStore";
import type { ProjectAssetRef, ProjectSnapshotListEntry } from "@/types/ipc";
import type { ProjectSnapshotManifest } from "@/core/types";

const DEFAULT_SNAPSHOT_NAME = "main";

export class ProjectService {
  public constructor(
    private readonly storage: StorageAdapter,
    private readonly store: AppStoreApi
  ) {}

  public async loadDefaultProject(): Promise<void> {
    const pointer = await this.storage.loadDefaults();
    await this.loadProject(pointer.defaultProjectName, pointer.defaultSnapshotName);
  }

  public async loadProject(projectName: string, snapshotName = DEFAULT_SNAPSHOT_NAME): Promise<void> {
    const raw = await this.storage.loadProjectSnapshot(projectName, snapshotName);
    if (raw.trim() === "{}") {
      const fresh = createInitialState(this.storage.mode, projectName, snapshotName);
      this.store.getState().actions.hydrate(fresh);
      this.store.getState().actions.setStats({
        projectFileBytes: 0,
        projectFileBytesSaved: 0
      });
      return;
    }
    const parsed = parseProjectSnapshot(raw);
    const canonicalizedManifest: ProjectSnapshotManifest =
      parsed.projectName === projectName && parsed.snapshotName === snapshotName
        ? parsed
        : { ...parsed, projectName, snapshotName };
    const migrated = await this.migrateLegacyGaussianAssets(canonicalizedManifest);
    const manifest = migrated.manifest;
    const projectBytes = new Blob([raw]).size;
    this.store.getState().actions.hydrate({
      ...createInitialState(this.storage.mode, projectName, snapshotName),
      activeProjectName: projectName,
      activeSnapshotName: snapshotName,
      scene: manifest.scene,
      actors: manifest.actors,
      components: manifest.components,
      camera: manifest.camera,
      cameraBookmarks: manifest.cameraBookmarks,
      time: manifest.time,
      materials: manifest.materials,
      assets: manifest.assets,
      dirty: false
    });
    this.store.getState().actions.setStats({
      projectFileBytes: projectBytes,
      projectFileBytesSaved: projectBytes
    });
    if (
      (migrated.changed || parsed.projectName !== projectName || parsed.snapshotName !== snapshotName) &&
      !this.storage.isReadOnly
    ) {
      await this.saveProject();
      if (migrated.changed) {
        this.store.getState().actions.setStatus("Converted legacy Gaussian assets to native splat binary.");
      }
    }
  }

  public async saveProject(): Promise<void> {
    if (this.storage.isReadOnly) {
      return;
    }

    const state = this.store.getState().state;
    const payload = serializeProjectSnapshot(buildProjectSnapshotManifest(state, this.storage.mode));
    await this.storage.saveProjectSnapshot(state.activeProjectName, state.activeSnapshotName, payload);
    this.store.getState().actions.setDirty(false);
    const savedBytes = new Blob([payload]).size;
    this.store.getState().actions.setStats({
      projectFileBytes: savedBytes,
      projectFileBytesSaved: savedBytes
    });
  }

  public async saveProjectAs(projectName: string): Promise<void> {
    if (this.storage.isReadOnly) {
      return;
    }

    const previousName = this.store.getState().state.activeProjectName;
    if (previousName === projectName) {
      await this.saveProject();
      return;
    }
    await this.saveProject();
    await this.storage.cloneProject(previousName, projectName);
    this.store.getState().actions.setProjectName(projectName);
    await this.storage.saveDefaults({
      defaultProjectName: projectName,
      defaultSnapshotName: this.store.getState().state.activeSnapshotName
    });
    await this.saveProject();
  }

  public async saveSnapshotAs(snapshotName: string): Promise<void> {
    if (this.storage.isReadOnly) {
      return;
    }
    const state = this.store.getState().state;
    const payload = serializeProjectSnapshot(buildProjectSnapshotManifest(state, this.storage.mode));
    await this.storage.saveProjectSnapshot(state.activeProjectName, snapshotName, payload);
    this.store.getState().actions.setSnapshotName(snapshotName);
    this.store.getState().actions.setDirty(false);
    const savedBytes = new Blob([payload]).size;
    this.store.getState().actions.setStats({
      projectFileBytes: savedBytes,
      projectFileBytesSaved: savedBytes
    });
  }

  public async createNewProject(projectName: string): Promise<void> {
    if (this.storage.isReadOnly) {
      return;
    }
    const fresh = createInitialState(this.storage.mode, projectName, DEFAULT_SNAPSHOT_NAME);
    this.store.getState().actions.hydrate(fresh);
    await this.storage.saveDefaults({
      defaultProjectName: projectName,
      defaultSnapshotName: DEFAULT_SNAPSHOT_NAME
    });
    await this.saveProject();
  }

  public async renameProject(previousName: string, nextName: string): Promise<void> {
    if (this.storage.isReadOnly || previousName === nextName) {
      return;
    }
    const stateBeforeRename = this.store.getState().state;
    const renamingActiveProject = stateBeforeRename.activeProjectName === previousName;
    if (renamingActiveProject) {
      await this.saveProject();
    }
    await this.storage.renameProject(previousName, nextName);
    const state = this.store.getState().state;
    if (renamingActiveProject || state.activeProjectName === previousName) {
      this.store.getState().actions.setProjectName(nextName);
    }
    await this.storage.saveDefaults({
      defaultProjectName: nextName,
      defaultSnapshotName: this.store.getState().state.activeSnapshotName
    });
    if (renamingActiveProject) {
      await this.saveProject();
    }
  }

  public async duplicateSnapshot(previousName: string, nextName: string): Promise<void> {
    if (this.storage.isReadOnly) {
      return;
    }
    const state = this.store.getState().state;
    await this.storage.duplicateSnapshot(state.activeProjectName, previousName, nextName);
  }

  public async renameSnapshot(previousName: string, nextName: string): Promise<void> {
    if (this.storage.isReadOnly || previousName === nextName) {
      return;
    }
    const state = this.store.getState().state;
    await this.storage.renameSnapshot(state.activeProjectName, previousName, nextName);
    if (state.activeSnapshotName === previousName) {
      this.store.getState().actions.setSnapshotName(nextName);
    }
    await this.saveDefaultsForCurrentState();
  }

  public async deleteSnapshot(snapshotName: string): Promise<void> {
    if (this.storage.isReadOnly) {
      return;
    }
    const state = this.store.getState().state;
    const snapshots = await this.storage.listSnapshots(state.activeProjectName);
    if (snapshots.length <= 1) {
      throw new Error("Cannot delete the last remaining snapshot.");
    }
    await this.storage.deleteSnapshot(state.activeProjectName, snapshotName);
    if (state.activeSnapshotName === snapshotName) {
      const remaining = snapshots.filter((entry) => entry.name !== snapshotName);
      const nextSnapshot = remaining[0]?.name ?? DEFAULT_SNAPSHOT_NAME;
      await this.loadProject(state.activeProjectName, nextSnapshot);
    }
    await this.saveDefaultsForCurrentState();
  }

  public async setDefaultProject(): Promise<void> {
    await this.saveDefaultsForCurrentState();
  }

  public async setDefaultSnapshot(): Promise<void> {
    await this.saveDefaultsForCurrentState();
  }

  public queueAutosave(delayMs = 1000): void {
    // Intentionally disabled: project persistence is manual-only.
    void delayMs;
  }

  public async listProjects(): Promise<string[]> {
    return this.storage.listProjects();
  }

  public async listSnapshots(projectName?: string): Promise<ProjectSnapshotListEntry[]> {
    return this.storage.listSnapshots(projectName ?? this.store.getState().state.activeProjectName);
  }

  public get isReadOnly(): boolean {
    return this.storage.isReadOnly;
  }

  private async migrateLegacyGaussianAssets(
    manifest: ProjectSnapshotManifest
  ): Promise<{ manifest: ProjectSnapshotManifest; changed: boolean }> {
    if (this.storage.isReadOnly) {
      return { manifest, changed: false };
    }
    let changed = false;
    const nextAssets: ProjectAssetRef[] = [];
    for (const asset of manifest.assets) {
      const isGaussian = asset.kind === "gaussian-splat";
      const alreadyNative = asset.encoding === "splatbin-v1" || asset.relativePath.toLowerCase().endsWith(".splatbin");
      if (!isGaussian || alreadyNative) {
        nextAssets.push(asset);
        continue;
      }
      const converted = await this.storage.convertGaussianAsset({
        projectName: manifest.projectName,
        assetId: asset.id,
        relativePath: asset.relativePath,
        sourceFileName: asset.sourceFileName
      });
      nextAssets.push(converted);
      changed = true;
    }
    return {
      manifest: changed ? { ...manifest, assets: nextAssets } : manifest,
      changed
    };
  }

  private async saveDefaultsForCurrentState(): Promise<void> {
    const state = this.store.getState().state;
    await this.storage.saveDefaults({
      defaultProjectName: state.activeProjectName,
      defaultSnapshotName: state.activeSnapshotName
    });
  }
}
