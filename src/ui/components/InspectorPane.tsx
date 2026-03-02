import { useEffect, useRef } from "react";
import { Pane } from "tweakpane";
import { useKernel } from "@/app/useKernel";
import { useAppStore } from "@/app/useAppStore";

function intersectKeys(objects: Array<Record<string, number | string | boolean>>): string[] {
  const first = objects[0];
  if (!first) {
    return [];
  }
  const rest = objects.slice(1);
  return Object.keys(first).filter((key) => rest.every((obj) => key in obj));
}

type PaneCompat = Pane & {
  addBlade?: (params: Record<string, unknown>) => unknown;
  addBinding?: (target: Record<string, unknown>, key: string) => { on?: (event: string, handler: (event: { value: unknown }) => void) => void };
};

export function InspectorPane() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<Pane | null>(null);
  const kernel = useKernel();
  const selection = useAppStore((store) => store.state.selection);
  const actors = useAppStore((store) => store.state.actors);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    let pane: Pane;
    try {
      pane = new Pane({
        container: rootRef.current,
        title: "Inspector"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown inspector initialization error.";
      kernel.store.getState().actions.setStatus(`Inspector initialization failed: ${message}`);
      return;
    }
    paneRef.current = pane;
    const paneCompat = pane as PaneCompat;

    const actorSelection = selection
      .filter((entry) => entry.kind === "actor")
      .map((entry) => actors[entry.id])
      .filter((actor): actor is NonNullable<typeof actor> => Boolean(actor));

    if (actorSelection.length === 0) {
      paneCompat.addBlade?.({
        view: "text",
        label: "Selection",
        value: "Select one or more actors/components"
      });
      return () => {
        pane.dispose();
      };
    }

    const commonKeys = intersectKeys(actorSelection.map((actor) => actor.params));
    if (commonKeys.length === 0) {
      paneCompat.addBlade?.({
        view: "text",
        label: "Params",
        value: "No common editable params in current selection"
      });
      return () => {
        pane.dispose();
      };
    }

    for (const key of commonKeys) {
      const firstActor = actorSelection[0];
      if (!firstActor) {
        continue;
      }
      const firstValue = firstActor.params[key];
      const bindingTarget: Record<string, unknown> = { [key]: firstValue };
      const binding = paneCompat.addBinding?.(bindingTarget, key);
      binding?.on?.("change", (event: { value: unknown }) => {
        const nextValue = event.value as number | string | boolean;
        for (const actor of actorSelection) {
          kernel.store.getState().actions.updateActorParams(actor.id, {
            [key]: nextValue
          });
        }
        kernel.sessionService.queueAutosave();
      });
    }

    return () => {
      if (paneRef.current === pane) {
        paneRef.current = null;
      }
      try {
        pane.dispose();
      } catch {
        // Tweakpane may already be torn down during rapid remounts.
      }
    };
  }, [selection, actors, kernel]);

  return <div className="inspector-pane-root" ref={rootRef} />;
}
