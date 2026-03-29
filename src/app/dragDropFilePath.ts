import type { ElectronApi } from "@/types/ipc";

export function resolveDraggedPreviewFile(dataTransfer: DataTransfer | null | undefined): File | null {
  if (!dataTransfer) {
    return null;
  }

  const directFile = dataTransfer.files?.[0];
  if (directFile) {
    return directFile;
  }

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") {
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }

  return null;
}

export function resolveDroppedFileSourcePath(
  file: File | null | undefined,
  electronApi?: Pick<ElectronApi, "getPathForFile"> | undefined
): string | null {
  if (!file) {
    return null;
  }
  const electronPath = electronApi?.getPathForFile(file);
  if (typeof electronPath === "string" && electronPath.trim().length > 0) {
    return electronPath;
  }
  const legacyPath = (file as File & { path?: unknown }).path;
  if (typeof legacyPath === "string" && legacyPath.trim().length > 0) {
    return legacyPath;
  }
  return null;
}
