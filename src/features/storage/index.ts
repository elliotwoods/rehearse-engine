import type { StorageAdapter } from "./storageAdapter";
import { createElectronStorageAdapter } from "./electronStorageAdapter";
import { createWebStorageAdapter } from "./webStorageAdapter";

export function createStorageAdapter(): StorageAdapter {
  if (window.electronAPI) {
    return createElectronStorageAdapter();
  }
  return createWebStorageAdapter();
}

