import type { ReloadableDescriptor } from "./types";
import type { AppKernel } from "@/app/kernel";

export function acceptDescriptorHotReload(
  moduleId: string,
  kernel: AppKernel,
  extract: () => ReloadableDescriptor[]
): void {
  if (!import.meta.hot) {
    return;
  }

  import.meta.hot.accept(() => {
    const descriptors = extract();
    kernel.hotReloadManager.applyModuleUpdate(moduleId, descriptors);
  });
}

