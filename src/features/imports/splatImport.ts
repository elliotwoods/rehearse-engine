import type { AppKernel } from "@/app/kernel";
import { createActorFromDescriptor } from "@/features/actors/actorCatalog";

export interface SplatImportRequest {
  projectName: string;
  sourcePath: string;
}

export async function importGaussianSplat(kernel: AppKernel, request: SplatImportRequest): Promise<string> {
  const asset = await kernel.storage.importGaussianSplat({
    projectName: request.projectName,
    sourcePath: request.sourcePath
  });

  const actorId = createActorFromDescriptor(kernel, "actor.gaussianSplat");
  if (!actorId) {
    throw new Error("Missing actor descriptor: actor.gaussianSplat");
  }
  kernel.store.getState().actions.updateActorParams(actorId, {
    assetId: asset.id,
    scaleFactor: 1,
    splatSize: 1,
    opacity: 1
  });
  kernel.store.setState((store) => ({
    ...store,
    state: {
      ...store.state,
      assets: [...store.state.assets, asset]
    }
  }));
  kernel.projectService.queueAutosave();
  return actorId;
}

