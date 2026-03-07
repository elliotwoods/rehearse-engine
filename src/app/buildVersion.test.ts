import { computeDerivedVersion, parseSemVer } from "@/app/buildVersion";

describe("build version helpers", () => {
  it("parses strict semantic versions", () => {
    expect(parseSemVer("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("rejects invalid semantic versions", () => {
    expect(() => parseSemVer("1.2")).toThrow(/Invalid semantic version/);
  });

  it("uses the baseline patch for dev builds at the anchor commit", () => {
    expect(computeDerivedVersion("0.1.0", 0, "dev")).toBe("0.1.0");
  });

  it("adds one patch increment for build output at the anchor commit", () => {
    expect(computeDerivedVersion("0.1.0", 0, "build")).toBe("0.1.1");
  });

  it("adds commit distance for dev builds", () => {
    expect(computeDerivedVersion("0.1.0", 3, "dev")).toBe("0.1.3");
  });

  it("adds commit distance plus one for build output", () => {
    expect(computeDerivedVersion("0.1.7", 4, "build")).toBe("0.1.12");
  });
});
