import { useKernel } from "./useKernel";
import type { AppStore } from "@/core/store/appStore";

export function useAppStore<T>(selector: (store: AppStore) => T): T {
  const kernel = useKernel();
  return kernel.store(selector);
}
