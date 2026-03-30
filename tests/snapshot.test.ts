import { describe, expect, it } from "vitest";

const SOURCE_ROOT = "/Users/elliot18/Downloads/SECdemo-main";

describe("buildSecDemoSnapshot", () => {
  it("returns the same roster and recruit data for the same seed", async () => {
    const mod = await import("../src/lib/snapshot/build-snapshot.ts").catch(() => null);

    expect(mod).not.toBeNull();

    const snapshotA = await mod!.buildSecDemoSnapshot({
      sourceRoot: SOURCE_ROOT,
      seed: 42
    });
    const snapshotB = await mod!.buildSecDemoSnapshot({
      sourceRoot: SOURCE_ROOT,
      seed: 42
    });

    expect(snapshotA.snapshotId).toBe("secdemo_seed_42");
    expect(snapshotA.officials.slice(0, 5)).toEqual(snapshotB.officials.slice(0, 5));
    expect(snapshotA.recruits.slice(0, 5)).toEqual(snapshotB.recruits.slice(0, 5));
  });

  it("materializes both generated and derived records", async () => {
    const mod = await import("../src/lib/snapshot/build-snapshot.ts").catch(() => null);

    expect(mod).not.toBeNull();

    const snapshot = await mod!.buildSecDemoSnapshot({
      sourceRoot: SOURCE_ROOT,
      seed: 42
    });

    expect(snapshot.sports).toHaveLength(10);
    expect(snapshot.officials).toHaveLength(245);
    expect(snapshot.recruits).toHaveLength(80);
    expect(snapshot.crewChiefs).toHaveLength(49);
    expect(snapshot.drills).toHaveLength(14);
    expect(snapshot.derivedAlignmentScores.length).toBeGreaterThan(1000);
    expect(snapshot.documents.length).toBeGreaterThan(100);
  });
});
