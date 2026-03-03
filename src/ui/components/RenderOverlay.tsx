import { useEffect, useRef } from "react";
import type { RenderProgress } from "@/features/render/types";

interface RenderOverlayProps {
  open: boolean;
  progress: RenderProgress | null;
  onHostReady: (host: HTMLDivElement | null) => void;
  onCancel: () => void;
}

export function RenderOverlay(props: RenderOverlayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    props.onHostReady(props.open ? hostRef.current : null);
    return () => {
      props.onHostReady(null);
    };
  }, [props.onHostReady, props.open]);

  if (!props.open) {
    return null;
  }

  return (
    <div className="render-overlay-backdrop">
      <div className="render-overlay">
        <header>
          <h3>Rendering</h3>
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        </header>
        <div className="render-overlay-canvas-host" ref={hostRef} />
        <footer>
          {props.progress ? (
            <p>
              Frame {Math.min(props.progress.frameIndex + 1, props.progress.frameCount)} / {props.progress.frameCount} -{" "}
              {props.progress.message}
            </p>
          ) : (
            <p>Starting render...</p>
          )}
        </footer>
      </div>
    </div>
  );
}
