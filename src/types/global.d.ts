import type { ElectronApi } from "./ipc";

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }
}

export {};

