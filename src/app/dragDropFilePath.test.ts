import { describe, expect, it, vi } from "vitest";
import { resolveDraggedPreviewFile, resolveDroppedFileSourcePath } from "@/app/dragDropFilePath";

describe("resolveDraggedPreviewFile", () => {
  it("prefers DataTransfer.files when a preview file is already exposed", () => {
    const file = new File(["mesh"], "tree.fbx");
    const dataTransfer = {
      files: [file],
      items: []
    } as unknown as DataTransfer;

    expect(resolveDraggedPreviewFile(dataTransfer)).toBe(file);
  });

  it("falls back to DataTransfer.items.getAsFile() before drop", () => {
    const file = new File(["splat"], "scene.splat");
    const item = {
      kind: "file",
      getAsFile: vi.fn(() => file)
    };
    const dataTransfer = {
      files: [],
      items: [item]
    } as unknown as DataTransfer;

    expect(resolveDraggedPreviewFile(dataTransfer)).toBe(file);
    expect(item.getAsFile).toHaveBeenCalledTimes(1);
  });

  it("returns null when Electron has not exposed file metadata yet", () => {
    const item = {
      kind: "file",
      getAsFile: vi.fn(() => null)
    };
    const dataTransfer = {
      files: [],
      items: [item]
    } as unknown as DataTransfer;

    expect(resolveDraggedPreviewFile(dataTransfer)).toBeNull();
  });
});

describe("resolveDroppedFileSourcePath", () => {
  it("prefers the Electron getPathForFile bridge when available", () => {
    const file = { path: "C:/legacy/plot.dxf" } as File & { path: string };
    const electronApi = {
      getPathForFile: vi.fn(() => "C:/electron/plot.dxf")
    };

    expect(resolveDroppedFileSourcePath(file, electronApi)).toBe("C:/electron/plot.dxf");
    expect(electronApi.getPathForFile).toHaveBeenCalledWith(file);
  });

  it("falls back to the legacy file.path field", () => {
    const file = { path: "C:/legacy/plot.dxf" } as File & { path: string };

    expect(resolveDroppedFileSourcePath(file)).toBe("C:/legacy/plot.dxf");
  });

  it("returns null when neither Electron nor the dropped file provides a path", () => {
    const file = {} as File;
    const electronApi = {
      getPathForFile: vi.fn(() => null)
    };

    expect(resolveDroppedFileSourcePath(file, electronApi)).toBeNull();
  });
});
