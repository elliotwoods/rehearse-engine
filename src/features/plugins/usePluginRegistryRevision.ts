import { useSyncExternalStore } from "react";
import { useKernel } from "@/app/useKernel";

export function usePluginRegistryRevision(): number {
  const kernel = useKernel();
  return useSyncExternalStore(
    kernel.pluginApi.subscribe,
    kernel.pluginApi.getRevision,
    kernel.pluginApi.getRevision
  );
}
