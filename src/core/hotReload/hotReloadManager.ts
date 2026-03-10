import type { AppStore, AppStoreApi } from "@/core/store/appStore";
import type { HotReloadEvent, ReloadableDescriptor } from "./types";
import { DescriptorRegistry } from "./descriptorRegistry";

export interface HotReloadSnapshot {
  state: AppStore["state"];
}

export class HotReloadManager {
  private onEvent: ((event: HotReloadEvent) => void) | undefined;

  public constructor(
    private readonly registry: DescriptorRegistry,
    private readonly store: AppStoreApi
  ) {}

  public subscribe(listener: (event: HotReloadEvent) => void): () => void {
    this.onEvent = listener;
    return () => {
      this.onEvent = undefined;
    };
  }

  public getSnapshot(): HotReloadSnapshot {
    return {
      state: structuredClone(this.store.getState().state)
    };
  }

  public restoreSnapshot(snapshot: HotReloadSnapshot): void {
    this.store.getState().actions.hydrate(structuredClone(snapshot.state));
  }

  public applyModuleUpdate(moduleId: string, descriptors: ReloadableDescriptor[]): boolean {
    const snapshot = this.getSnapshot();
    try {
      for (const descriptor of descriptors) {
        const result = this.registry.replaceDescriptor(descriptor);
        this.emit({
          moduleId,
          changeType: result.previous ? "replaced" : "added",
          applied: true
        });
      }
      this.store.getState().actions.setStatus(`Hot reload applied: ${moduleId}`);
      return true;
    } catch (error) {
      this.restoreSnapshot(snapshot);
      this.emit({
        moduleId,
        changeType: "replaced",
        applied: false,
        fallbackReason: error instanceof Error ? error.message : "Unknown hot reload error"
      });
      this.store.getState().actions.setStatus(`Hot reload fallback for ${moduleId}`);
      return false;
    }
  }

  public applyDescriptorSetUpdate(
    moduleId: string,
    previousDescriptorIds: string[],
    descriptors: ReloadableDescriptor[]
  ): boolean {
    const snapshot = this.getSnapshot();
    try {
      const nextIds = new Set(descriptors.map((descriptor) => descriptor.id));
      for (const descriptor of descriptors) {
        const result = this.registry.replaceDescriptor(descriptor);
        this.emit({
          moduleId,
          changeType: result.previous ? "replaced" : "added",
          applied: true
        });
      }
      for (const descriptorId of previousDescriptorIds) {
        if (nextIds.has(descriptorId)) {
          continue;
        }
        const removed = this.registry.unregister(descriptorId);
        if (removed) {
          this.emit({
            moduleId,
            changeType: "removed",
            applied: true
          });
        }
      }
      this.store.getState().actions.setStatus(`Hot reload applied: ${moduleId}`);
      return true;
    } catch (error) {
      this.restoreSnapshot(snapshot);
      this.emit({
        moduleId,
        changeType: "replaced",
        applied: false,
        fallbackReason: error instanceof Error ? error.message : "Unknown hot reload error"
      });
      this.store.getState().actions.setStatus(`Hot reload fallback for ${moduleId}`);
      return false;
    }
  }

  private emit(event: HotReloadEvent): void {
    this.onEvent?.(event);
  }
}
