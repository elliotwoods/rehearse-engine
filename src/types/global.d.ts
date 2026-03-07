import type { ElectronApi } from "./ipc";
import type { BuildInfo } from "../app/buildVersion";

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }

  const __SIMULARCA_BUILD_INFO__: BuildInfo;
}

export {};

