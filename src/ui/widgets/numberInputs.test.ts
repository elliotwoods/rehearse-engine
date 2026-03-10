import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BufferedNumberTextInput } from "@/ui/widgets/BufferedNumberTextInput";
import { DigitScrubInput } from "@/ui/widgets/DigitScrubInput";
import { NumberField } from "@/ui/widgets/NumberField";
import { inferDisplayPrecision } from "@/ui/widgets/numberEditing";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

function renderElement(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  mountedContainers.push(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function dispatchInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function blur(element: HTMLElement) {
  element.focus();
  act(() => {
    element.blur();
  });
}

function keydown(element: HTMLElement, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeAll(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    measureText: () => ({ width: 8 })
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (originalResizeObserver) {
    vi.stubGlobal("ResizeObserver", originalResizeObserver);
    return;
  }
  vi.unstubAllGlobals();
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => {
      root?.unmount();
    });
  }
  while (mountedContainers.length > 0) {
    mountedContainers.pop()?.remove();
  }
});

describe("DigitScrubInput", () => {
  it("enters edit mode when clicking on a digit", () => {
    const onChange = vi.fn();
    const { container } = renderElement(
      React.createElement(DigitScrubInput, {
        value: 12.5,
        precision: 1,
        onChange
      })
    );

    const digit = Array.from(container.querySelectorAll(".digit")).find((node) => node.textContent === "1");
    expect(digit).not.toBeNull();
    click(digit as Element);

    expect(container.querySelector('input[type="text"]')).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps invalid text local until commit and reverts on invalid enter", () => {
    const onChange = vi.fn();
    const { container } = renderElement(
      React.createElement(DigitScrubInput, {
        value: 1.5,
        precision: 2,
        onChange
      })
    );

    click(container.querySelector("button") as HTMLButtonElement);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    dispatchInputValue(input, "-");

    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector(".widget-buffered-number-indicator")?.textContent).toBe("!");

    input.focus();
    keydown(input, "Enter");

    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(container.textContent).toContain("1.50");
  });

  it("snaps stepped text commits on blur", () => {
    const onChange = vi.fn();
    const { container } = renderElement(
      React.createElement(DigitScrubInput, {
        value: 1,
        precision: 2,
        step: 0.1,
        onChange
      })
    );

    click(container.querySelector("button") as HTMLButtonElement);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    dispatchInputValue(input, "1.23");
    blur(input);

    expect(onChange).toHaveBeenCalledWith(1.2);
  });

  it("keeps formatted trailing zeros after opening and committing unchanged text", () => {
    const onChange = vi.fn();
    const { container } = renderElement(
      React.createElement(DigitScrubInput, {
        value: 0.05,
        precision: 3,
        onChange
      })
    );

    expect(container.textContent).toContain("0.050");

    click(container.querySelector("button") as HTMLButtonElement);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    keydown(input, "Enter");

    expect(onChange).toHaveBeenCalledWith(0.05);
    expect(container.textContent).toContain("0.050");
  });
});

describe("BufferedNumberTextInput", () => {
  it("does not apply invalid drafts and restores the committed value on blur", () => {
    const onChange = vi.fn();
    const { container } = renderElement(
      React.createElement(BufferedNumberTextInput, {
        value: 24,
        step: 1,
        precision: 0,
        onChange
      })
    );

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });
    dispatchInputValue(input, "1e-");

    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector(".widget-buffered-number-indicator")?.textContent).toBe("!");

    blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("24");
  });
});

describe("NumberField", () => {
  it("uses digit scrub input for ranged values", () => {
    const onChange = vi.fn();
    const { container } = renderElement(
      React.createElement(NumberField, {
        label: "Test",
        value: 4,
        min: 0,
        max: 10,
        step: 0.5,
        precision: 1,
        onChange
      })
    );

    expect(container.querySelector('input[type="range"]')).not.toBeNull();
    expect(container.querySelector("button.widget-digit-input")).not.toBeNull();
  });

  it("does not show decimals for integer-stepped values", () => {
    const onChange = vi.fn();
    const { container } = renderElement(
      React.createElement(NumberField, {
        label: "Frames",
        value: 12,
        step: 1,
        onChange
      })
    );

    expect(container.textContent).toContain("12");
    expect(container.textContent).not.toContain("12.0");
    expect(container.textContent).not.toContain("12.00");
  });
});

describe("inferDisplayPrecision", () => {
  it("infers decimal places from step with a minimum of zero", () => {
    expect(inferDisplayPrecision(undefined, 1)).toBe(0);
    expect(inferDisplayPrecision(undefined, 0.1)).toBe(1);
    expect(inferDisplayPrecision(undefined, 0.01)).toBe(2);
    expect(inferDisplayPrecision(undefined, 0.125)).toBe(3);
  });
});
