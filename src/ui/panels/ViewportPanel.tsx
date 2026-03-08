import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnet, faMaximize, faRotateRight, faUpDownLeftRight } from "@fortawesome/free-solid-svg-icons";
import { useKernel } from "@/app/useKernel";
import { useAppStore } from "@/app/useAppStore";
import type { SceneFramePacingSettings } from "@/core/types";
import type { ActorTransformMode } from "@/render/actorTransformController";
import { WebGpuViewport } from "@/render/webgpuRenderer";
import { WebGlViewport } from "@/render/webglRenderer";

interface ViewportRuntime {
  start(): Promise<void>;
  stop(): void;
  setActorTransformMode(mode: ActorTransformMode): void;
  setActorTransformSnappingEnabled(enabled: boolean): void;
  setFramePacing(settings: SceneFramePacingSettings): void;
}

interface ViewportPanelProps {
  suspended?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function ViewportPanel(props: ViewportPanelProps) {
  const kernel = useKernel();
  const backend = useAppStore((store) => store.state.scene.renderEngine);
  const antialiasing = useAppStore((store) => store.state.scene.antialiasing);
  const framePacing = useAppStore((store) => store.state.scene.framePacing);
  // Returns a stable string so Zustand's reference equality check avoids spurious re-renders.
  const loadingBannerText = useAppStore((store) => {
    const statuses = store.state.actorStatusByActorId;
    const actors = store.state.actors;
    const names: string[] = [];
    for (const [actorId, s] of Object.entries(statuses)) {
      if (s.values.loadState !== "loading") continue;
      const fileName = s.values.assetFileName;
      names.push(typeof fileName === "string" ? fileName : (actors[actorId]?.name ?? "asset"));
    }
    if (names.length === 0) return "";
    if (names.length === 1) return names[0]!;
    return `${names.length} assets`;
  });
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportRuntime | null>(null);
  const hideOverlayTimeoutRef = useRef<number | null>(null);
  const resizeObservedElementsRef = useRef<HTMLElement[]>([]);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [showResolutionOverlay, setShowResolutionOverlay] = useState(false);
  const [actorTransformMode, setActorTransformMode] = useState<ActorTransformMode>("none");
  const [actorTransformSnapToggled, setActorTransformSnapToggled] = useState(true);
  const [actorTransformSnapShiftOverride, setActorTransformSnapShiftOverride] = useState(false);
  const actorTransformSnappingEnabled = actorTransformSnapToggled !== actorTransformSnapShiftOverride;
  const toggleActorTransformMode = (mode: Exclude<ActorTransformMode, "none">) => {
    setActorTransformMode((current) => (current === mode ? "none" : mode));
  };

  useEffect(() => {
    if (props.suspended) {
      return;
    }
    if (!hostRef.current) {
      return;
    }
    const viewport: ViewportRuntime =
      backend === "webgl2"
        ? new WebGlViewport(kernel, hostRef.current, { antialias: antialiasing, qualityMode: "interactive" })
        : new WebGpuViewport(kernel, hostRef.current, { antialias: antialiasing, qualityMode: "interactive" });
    viewport.setActorTransformMode(actorTransformMode);
    viewport.setActorTransformSnappingEnabled(actorTransformSnappingEnabled);
    viewport.setFramePacing(framePacing);
    viewportRef.current = viewport;
    let cancelled = false;
    void viewport.start().catch((error) => {
      if (cancelled) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : `Unknown ${backend === "webgl2" ? "WebGL2" : "WebGPU"} startup error.`;
      kernel.store.getState().actions.setStatus(`Viewport startup failed: ${message}`);
    });
    return () => {
      cancelled = true;
      viewport.stop();
      viewportRef.current = null;
    };
  }, [antialiasing, backend, kernel, props.suspended]);

  useEffect(() => {
    viewportRef.current?.setActorTransformMode(actorTransformMode);
  }, [actorTransformMode]);

  useEffect(() => {
    viewportRef.current?.setActorTransformSnappingEnabled(actorTransformSnappingEnabled);
  }, [actorTransformSnappingEnabled]);

  useEffect(() => {
    viewportRef.current?.setFramePacing(framePacing);
  }, [framePacing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setActorTransformSnapShiftOverride(true);
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        setActorTransformMode((current) => (current === "translate" ? "none" : "translate"));
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        setActorTransformMode((current) => (current === "rotate" ? "none" : "rotate"));
        return;
      }
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        setActorTransformMode((current) => (current === "scale" ? "none" : "scale"));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setActorTransformSnapShiftOverride(false);
      }
    };
    const onBlur = () => {
      setActorTransformSnapShiftOverride(false);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const hostEl = hostRef.current;
    const collectObservedElements = (): HTMLElement[] => {
      const elements: HTMLElement[] = [];
      const seen = new Set<HTMLElement>();
      let node: HTMLElement | null = hostEl;
      for (let depth = 0; node && depth < 8; depth += 1) {
        if (!seen.has(node)) {
          seen.add(node);
          elements.push(node);
        }
        if (
          node.classList.contains("flexlayout__tabset_content") ||
          node.classList.contains("flexlayout__tabset_container") ||
          node.classList.contains("flexlayout__layout")
        ) {
          break;
        }
        node = node.parentElement;
      }
      return elements;
    };
    const getEffectiveViewportSize = (): { width: number; height: number } => {
      const elements = resizeObservedElementsRef.current.length > 0 ? resizeObservedElementsRef.current : [hostEl];
      const measurementElements = elements.length > 1 ? elements.slice(1) : elements;
      let width = Number.POSITIVE_INFINITY;
      let height = Number.POSITIVE_INFINITY;
      for (const element of measurementElements) {
        width = Math.min(width, Math.max(1, Math.round(element.clientWidth)));
        height = Math.min(height, Math.max(1, Math.round(element.clientHeight)));
      }
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return {
          width: Math.max(1, Math.round(hostEl.clientWidth)),
          height: Math.max(1, Math.round(hostEl.clientHeight))
        };
      }
      return { width, height };
    };
    const onResize = () => {
      const { width, height } = getEffectiveViewportSize();
      setViewportSize({ width, height });
      setShowResolutionOverlay(true);
      if (hideOverlayTimeoutRef.current !== null) {
        window.clearTimeout(hideOverlayTimeoutRef.current);
      }
      hideOverlayTimeoutRef.current = window.setTimeout(() => {
        setShowResolutionOverlay(false);
        hideOverlayTimeoutRef.current = null;
      }, 320);
    };
    const observer = new ResizeObserver(onResize);
    resizeObservedElementsRef.current = collectObservedElements();
    for (const element of resizeObservedElementsRef.current) {
      observer.observe(element);
    }
    const onWindowResize = () => onResize();
    window.addEventListener("resize", onWindowResize);
    onResize();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onWindowResize);
      resizeObservedElementsRef.current = [];
      if (hideOverlayTimeoutRef.current !== null) {
        window.clearTimeout(hideOverlayTimeoutRef.current);
        hideOverlayTimeoutRef.current = null;
      }
    };
  }, []);

  return (
      <div className="viewport-panel">
      <div className="viewport-canvas-host" ref={hostRef} />
      {!props.suspended ? (
        <div className="viewport-transform-toolbar" role="toolbar" aria-label="Actor transform mode">
          <button
            type="button"
            className={`viewport-transform-button${actorTransformMode === "translate" ? " is-active" : ""}`}
            onClick={() => toggleActorTransformMode("translate")}
            title={`Translate selected actor (G)${actorTransformMode === "translate" ? " - click again to hide gizmo" : ""}`}
            aria-label="Translate selected actor (G)"
          >
            <FontAwesomeIcon icon={faUpDownLeftRight} />
          </button>
          <button
            type="button"
            className={`viewport-transform-button${actorTransformMode === "rotate" ? " is-active" : ""}`}
            onClick={() => toggleActorTransformMode("rotate")}
            title={`Rotate selected actor (R)${actorTransformMode === "rotate" ? " - click again to hide gizmo" : ""}`}
            aria-label="Rotate selected actor (R)"
          >
            <FontAwesomeIcon icon={faRotateRight} />
          </button>
          <button
            type="button"
            className={`viewport-transform-button${actorTransformMode === "scale" ? " is-active" : ""}`}
            onClick={() => toggleActorTransformMode("scale")}
            title={`Scale selected actor (S)${actorTransformMode === "scale" ? " - click again to hide gizmo" : ""}`}
            aria-label="Scale selected actor (S)"
          >
            <FontAwesomeIcon icon={faMaximize} />
          </button>
          <button
            type="button"
            className={`viewport-transform-button${actorTransformSnapToggled ? " is-active" : ""}`}
            onClick={() => setActorTransformSnapToggled((value) => !value)}
            title={`Transform snapping ${actorTransformSnapToggled ? "on" : "off"} (hold Shift to temporarily ${actorTransformSnapToggled ? "disable" : "enable"})`}
            aria-label={`Transform snapping ${actorTransformSnapToggled ? "on" : "off"}`}
          >
            <FontAwesomeIcon icon={faMagnet} />
          </button>
        </div>
      ) : null}
      {props.suspended ? <div className="viewport-suspended-overlay">Viewport suspended during render</div> : null}
      {loadingBannerText && !props.suspended ? (
        <div className="viewport-loading-banner">
          <span className="viewport-loading-spinner" />
          Loading {loadingBannerText}&ensp;&mdash;&ensp;window may be unresponsive
        </div>
      ) : null}
      <div className={`viewport-resolution-overlay${showResolutionOverlay ? " is-visible" : ""}`}>
        {viewportSize.width} x {viewportSize.height} ({backend === "webgl2" ? "WEBGL2" : "WEBGPU"})
      </div>
    </div>
  );
}
