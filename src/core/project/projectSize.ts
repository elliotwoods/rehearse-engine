import type { AppState, ProjectSnapshotManifest } from "@/core/types";
import { buildProjectSnapshotManifest } from "@/core/project/projectSnapshotManifest";
import { serializeProjectSnapshot } from "@/core/project/projectSnapshotSchema";

export function estimateProjectPayloadBytes(state: AppState, mode: ProjectSnapshotManifest["appMode"]): number {
  const payload = serializeProjectSnapshot(buildProjectSnapshotManifest(state, mode));
  return new Blob([payload]).size;
}
