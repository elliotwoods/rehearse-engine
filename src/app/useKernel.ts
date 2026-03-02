import { useContext } from "react";
import { KernelContext } from "./KernelContext";
import type { AppKernel } from "./kernel";

export function useKernel(): AppKernel {
  const kernel = useContext(KernelContext);
  if (!kernel) {
    throw new Error("KernelProvider is missing.");
  }
  return kernel;
}

