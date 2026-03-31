import type { ElectronApi, RendererDebugBridge } from "./ipc";
import type { BuildInfo } from "../app/buildVersion";

declare global {
  interface Window {
    electronAPI?: ElectronApi;
    __REHEARSE_ENGINE_DEBUG__?: RendererDebugBridge;
  }

  const __REHEARSE_ENGINE_BUILD_INFO__: BuildInfo;
}

export {};

