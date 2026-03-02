import { useEffect, useMemo, useState } from "react";
import { useKernel } from "@/app/useKernel";
import { useAppStore } from "@/app/useAppStore";
import { registerCoreActorDescriptors, setupActorHotReload } from "@/features/actors/registerCoreActors";
import { FlexLayoutHost } from "@/ui/FlexLayoutHost";
import { TopBarPanel } from "@/ui/panels/TopBarPanel";
import { KeyboardMapModal } from "@/ui/components/KeyboardMapModal";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.closest("[contenteditable='true']")) {
    return true;
  }
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

export function App() {
  const kernel = useKernel();
  const [keyboardMapOpen, setKeyboardMapOpen] = useState(false);
  const dirty = useAppStore((store) => store.state.dirty);
  const activeSessionName = useAppStore((store) => store.state.activeSessionName);
  const readOnly = useAppStore((store) => store.state.mode === "web-ro");

  useEffect(() => {
    registerCoreActorDescriptors(kernel);
    setupActorHotReload(kernel);
    const unsubscribe = kernel.hotReloadManager.subscribe((event) => {
      if (event.applied) {
        kernel.store.getState().actions.setStatus(`Hot reload applied: ${event.moduleId}`);
      } else {
        kernel.store
          .getState()
          .actions.setStatus(`Hot reload fallback: ${event.moduleId} (${event.fallbackReason ?? "unknown reason"})`);
      }
    });
    void kernel.sessionService.loadDefaultSession();
    return () => {
      unsubscribe();
    };
  }, [kernel]);

  useEffect(() => {
    if (dirty && !readOnly) {
      kernel.sessionService.queueAutosave();
    }
  }, [dirty, kernel, readOnly]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      const actions = kernel.store.getState().actions;

      if (event.key === " ") {
        event.preventDefault();
        const running = kernel.store.getState().state.time.running;
        actions.setTimeRunning(!running);
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        actions.deleteSelection();
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setKeyboardMapOpen((value) => !value);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          const nextName = window.prompt("Save as session name", activeSessionName);
          if (nextName) {
            void kernel.sessionService.saveAs(nextName);
          }
          return;
        }
        void kernel.sessionService.saveSession();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          actions.redo();
        } else {
          actions.undo();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeSessionName, kernel]);

  const topBar = useMemo(
    () => <TopBarPanel onToggleKeyboardMap={() => setKeyboardMapOpen((value) => !value)} />,
    []
  );

  return (
    <div className="app-root">
      <FlexLayoutHost topBar={topBar} />
      <KeyboardMapModal open={keyboardMapOpen} onClose={() => setKeyboardMapOpen(false)} />
    </div>
  );
}
