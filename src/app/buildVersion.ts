export type BuildKind = "dev" | "build";

export interface VersionBaseline {
  baseVersion: string;
  anchorCommit: string;
}

export interface BuildInfo {
  version: string;
  baseVersion: string;
  commitsSinceAnchor: number;
  buildKind: BuildKind;
  buildTimestampIso: string;
  commitSha: string;
  commitShortSha: string;
  commitSubject: string;
}

interface SemVerParts {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemVer(input: string): SemVerParts {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid semantic version "${input}". Expected major.minor.patch.`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

export function formatSemVer(version: SemVerParts): string {
  return `${String(version.major)}.${String(version.minor)}.${String(version.patch)}`;
}

export function computeDerivedVersion(baseVersion: string, commitsSinceAnchor: number, buildKind: BuildKind): string {
  const parsed = parseSemVer(baseVersion);
  const safeCommits = Number.isFinite(commitsSinceAnchor) ? Math.max(0, Math.floor(commitsSinceAnchor)) : 0;
  const buildOffset = buildKind === "build" ? 1 : 0;
  return formatSemVer({
    ...parsed,
    patch: parsed.patch + safeCommits + buildOffset
  });
}
