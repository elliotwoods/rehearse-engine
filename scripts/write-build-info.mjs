import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const baselinePath = path.join(repoRoot, "version-baseline.json");
const outputPath = path.join(repoRoot, ".simularca-build-info.json");

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function parseSemVer(input) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(input).trim());
  if (!match) {
    throw new Error(`Invalid semantic version "${input}". Expected major.minor.patch.`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function computeDerivedVersion(baseVersion, commitsSinceAnchor, buildKind) {
  const parsed = parseSemVer(baseVersion);
  const safeCommits = Number.isFinite(commitsSinceAnchor) ? Math.max(0, Math.floor(commitsSinceAnchor)) : 0;
  const buildOffset = buildKind === "build" ? 1 : 0;
  return `${parsed.major}.${parsed.minor}.${parsed.patch + safeCommits + buildOffset}`;
}

function loadBaseline() {
  const raw = readFileSync(baselinePath, "utf8");
  const parsed = JSON.parse(raw);
  if (typeof parsed.baseVersion !== "string" || parsed.baseVersion.trim().length === 0) {
    throw new Error(`Missing or invalid baseVersion in ${path.basename(baselinePath)}.`);
  }
  if (typeof parsed.anchorCommit !== "string" || parsed.anchorCommit.trim().length === 0) {
    throw new Error(`Missing or invalid anchorCommit in ${path.basename(baselinePath)}.`);
  }
  return {
    baseVersion: parsed.baseVersion.trim(),
    anchorCommit: parsed.anchorCommit.trim()
  };
}

function validateAnchorCommit(anchorCommit) {
  runGit(["cat-file", "-e", `${anchorCommit}^{commit}`]);
  runGit(["merge-base", "--is-ancestor", anchorCommit, "HEAD"]);
}

function resolveBuildKind() {
  const input = process.argv[2];
  if (input === "dev" || input === "build") {
    return input;
  }
  throw new Error(`Expected build kind "dev" or "build"; received "${input ?? ""}".`);
}

function main() {
  const buildKind = resolveBuildKind();
  const baseline = loadBaseline();
  validateAnchorCommit(baseline.anchorCommit);

  const commitsSinceAnchor = Number.parseInt(runGit(["rev-list", "--count", `${baseline.anchorCommit}..HEAD`]), 10);
  if (!Number.isFinite(commitsSinceAnchor) || commitsSinceAnchor < 0) {
    throw new Error("Unable to calculate commits since anchor.");
  }

  const buildInfo = {
    version: computeDerivedVersion(baseline.baseVersion, commitsSinceAnchor, buildKind),
    baseVersion: baseline.baseVersion,
    commitsSinceAnchor,
    buildKind,
    buildTimestampIso: new Date().toISOString(),
    commitSha: runGit(["rev-parse", "HEAD"]),
    commitShortSha: runGit(["rev-parse", "--short=8", "HEAD"]),
    commitSubject: runGit(["log", "-1", "--pretty=%s"])
  };

  writeFileSync(outputPath, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
  console.log(`Build info written: v${buildInfo.version} (${buildInfo.buildKind}) ${buildInfo.commitShortSha}`);
}

main();
