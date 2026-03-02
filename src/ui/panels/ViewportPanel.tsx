import { useEffect, useMemo, useRef } from "react";
import { useKernel } from "@/app/useKernel";
import { WebGpuViewport } from "@/render/webgpuRenderer";
import { importGaussianSplat } from "@/features/imports/splatImport";
import { importHdriToKtx2 } from "@/features/imports/hdriImport";
import { useAppStore } from "@/app/useAppStore";

function getNativeFilePath(file: File): string | undefined {
  const withPath = file as File & { path?: string };
  return withPath.path;
}

export function ViewportPanel() {
  const kernel = useKernel();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<WebGpuViewport | null>(null);
  const sessionName = useAppStore((store) => store.state.activeSessionName);
  const mode = useAppStore((store) => store.state.mode);
  const readOnly = mode === "web-ro";

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const viewport = new WebGpuViewport(kernel, hostRef.current);
    viewportRef.current = viewport;
    let cancelled = false;
    void viewport.start().catch((error) => {
      if (cancelled) {
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown WebGPU startup error.";
      kernel.store.getState().actions.setStatus(`Viewport startup failed: ${message}`);
    });
    return () => {
      cancelled = true;
      viewport.stop();
      viewportRef.current = null;
    };
  }, [kernel]);

  const toolbar = useMemo(
    () => (
      <div className="viewport-toolbar">
        <label className="import-control">
          Import HDRI
          <input
            type="file"
            accept=".hdr,.exr,.ktx2,.png,.jpg,.jpeg"
            disabled={readOnly}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              const sourcePath = getNativeFilePath(file);
              if (!sourcePath) {
                kernel.store.getState().actions.setStatus("HDRI import requires desktop (Electron) mode.");
                return;
              }
              void importHdriToKtx2(kernel, {
                sessionName,
                sourcePath,
                options: {
                  uastc: true,
                  zstdLevel: 18,
                  generateMipmaps: true
                }
              }).then(() => {
                kernel.store.getState().actions.setStatus("HDRI imported and transcoded to KTX2.");
              });
            }}
          />
        </label>

        <label className="import-control">
          Import PLY Splat
          <input
            type="file"
            accept=".ply"
            disabled={readOnly}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              const sourcePath = getNativeFilePath(file);
              if (!sourcePath) {
                kernel.store.getState().actions.setStatus("PLY import requires desktop (Electron) mode.");
                return;
              }
              void importGaussianSplat(kernel, {
                sessionName,
                sourcePath
              }).then(() => {
                kernel.store.getState().actions.setStatus("Gaussian splat imported.");
              });
            }}
          />
        </label>
      </div>
    ),
    [kernel, readOnly, sessionName]
  );

  return (
    <div className="viewport-panel">
      {toolbar}
      <div className="viewport-canvas-host" ref={hostRef} />
    </div>
  );
}

