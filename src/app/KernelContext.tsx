import { createContext } from "react";
import type { AppKernel } from "./kernel";

export const KernelContext = createContext<AppKernel | null>(null);

export function KernelProvider(props: { kernel: AppKernel; children: React.ReactNode }) {
  return <KernelContext.Provider value={props.kernel}>{props.children}</KernelContext.Provider>;
}
