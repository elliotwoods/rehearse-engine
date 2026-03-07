import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { KernelProvider } from "@/app/KernelContext";
import type { AppKernel } from "@/app/kernel";
import { createAppStore } from "@/core/store/appStore";
import { beamEmitterDescriptor } from "../../../plugins/beam-crossover-plugin/src/beamPlugin";
import { InspectorPane } from "@/ui/components/InspectorPane";

class ResizeObserverMock {
  public observe(): void {}
  public disconnect(): void {}
  public unobserve(): void {}
}

function createKernelStub(): AppKernel {
  const store = createAppStore("electron-rw");
  return {
    store,
    storage: {} as AppKernel["storage"],
    projectService: { queueAutosave() {} } as AppKernel["projectService"],
    hotReloadManager: {} as AppKernel["hotReloadManager"],
    pluginApi: {
      listPlugins: () => []
    } as unknown as AppKernel["pluginApi"],
    descriptorRegistry: {
      listByKind: () => [beamEmitterDescriptor]
    } as unknown as AppKernel["descriptorRegistry"],
    clock: {} as AppKernel["clock"]
  };
}

describe("InspectorPane beam emitter", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      font: "",
      measureText: () => ({ width: 8 })
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    if (originalResizeObserver) {
      vi.stubGlobal("ResizeObserver", originalResizeObserver);
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    document.body.innerHTML = "";
  });

  it("shows shader properties drill-in and resolves scattering-shell defaults on first open", async () => {
    const kernel = createKernelStub();
    const actions = kernel.store.getState().actions;
    const actorId = actions.createActor({
      actorType: "plugin",
      pluginType: "plugin.beamCrossover.emitter",
      name: "Beam Emitter"
    });
    actions.select([{ kind: "actor", id: actorId }]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          KernelProvider as React.ComponentType<{ kernel: AppKernel; children?: React.ReactNode }>,
          { kernel },
          React.createElement(InspectorPane)
        )
      );
    });

    expect(container.textContent).toContain("Shader Properties");
    expect(container.textContent).not.toContain("Haze Intensity");

    const shaderButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Shader Properties"));
    expect(shaderButton).toBeTruthy();

    await act(async () => {
      shaderButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Beam Type");
    expect(container.textContent).toContain("Haze Intensity");
    expect(container.textContent).toContain("Scattering Coefficient");

    await act(async () => {
      root.unmount();
    });
  });

  it("shows xyz scale controls and resets scale to one", async () => {
    const kernel = createKernelStub();
    const actions = kernel.store.getState().actions;
    const actorId = actions.createActor({
      actorType: "plugin",
      pluginType: "plugin.beamCrossover.emitter",
      name: "Beam Emitter"
    });
    actions.setActorTransform(actorId, "scale", [2, 3, 4]);
    actions.select([{ kind: "actor", id: actorId }]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          KernelProvider as React.ComponentType<{ kernel: AppKernel; children?: React.ReactNode }>,
          { kernel },
          React.createElement(InspectorPane)
        )
      );
    });

    expect(container.textContent).toContain("Scale");
    expect(container.textContent).toContain("X");
    expect(container.textContent).toContain("Y");
    expect(container.textContent).toContain("Z");

    const resetScaleButton = Array.from(container.querySelectorAll("button")).find((button) => button.title === "Reset Scale");
    expect(resetScaleButton).toBeTruthy();

    await act(async () => {
      resetScaleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(kernel.store.getState().state.actors[actorId]?.transform.scale).toEqual([1, 1, 1]);

    await act(async () => {
      root.unmount();
    });
  });
});
