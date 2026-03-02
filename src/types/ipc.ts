export type AppMode = "electron-rw" | "web-ro";

export interface DefaultSessionPointer {
  defaultSessionName: string;
}

export interface SessionAssetRef {
  id: string;
  kind: "hdri" | "gaussian-splat" | "generic";
  relativePath: string;
  sourceFileName: string;
  byteSize: number;
}

export interface HdriTranscodeOptions {
  uastc?: boolean;
  zstdLevel?: number;
  generateMipmaps?: boolean;
}

export interface ElectronApi {
  mode: AppMode;
  listSessions(): Promise<string[]>;
  loadDefaults(): Promise<DefaultSessionPointer>;
  saveDefaults(pointer: DefaultSessionPointer): Promise<void>;
  loadSession(sessionName: string): Promise<string>;
  saveSession(sessionName: string, payload: string): Promise<void>;
  importAsset(args: {
    sessionName: string;
    sourcePath: string;
    kind: SessionAssetRef["kind"];
  }): Promise<SessionAssetRef>;
  transcodeHdriToKtx2(args: {
    sessionName: string;
    sourcePath: string;
    options?: HdriTranscodeOptions;
  }): Promise<SessionAssetRef>;
  deleteAsset(args: { sessionName: string; relativePath: string }): Promise<void>;
  resolveAssetPath(args: { sessionName: string; relativePath: string }): Promise<string>;
  logRuntimeError(payload: Record<string, unknown>): void;
}

