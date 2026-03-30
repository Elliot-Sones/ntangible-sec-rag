import { describe, expect, it } from "vitest";

const AVAILABLE_SPORTS = [
  "football",
  "baseball",
  "softball",
  "mbball",
  "wbball",
  "msoccer",
  "wsoccer",
  "mvolleyball",
  "wvolleyball",
  "hockey"
];

describe("detectSportScope", () => {
  it("routes basketball questions to basketball-only scope", async () => {
    const mod = await import("../src/lib/chat/scope.ts").catch(() => null);

    expect(mod).not.toBeNull();

    const result = mod!.detectSportScope(
      "Who has the highest clutch factor in basketball?",
      null,
      AVAILABLE_SPORTS
    );

    expect(result.mode).toBe("sport_family");
    expect(result.sports).toEqual(["mbball", "wbball"]);
    expect(result.crossSport).toBe(false);
  });

  it("honors explicit all-sports questions", async () => {
    const mod = await import("../src/lib/chat/scope.ts").catch(() => null);

    expect(mod).not.toBeNull();

    const result = mod!.detectSportScope(
      "Compare the top clutch officials across all sports",
      "mbball",
      AVAILABLE_SPORTS
    );

    expect(result.mode).toBe("cross_sport");
    expect(result.sports).toEqual(AVAILABLE_SPORTS);
    expect(result.crossSport).toBe(true);
  });

  it("prefers explicit sport mentions over selected UI scope", async () => {
    const mod = await import("../src/lib/chat/scope.ts").catch(() => null);

    expect(mod).not.toBeNull();

    const result = mod!.detectSportScope(
      "Show me the top soccer crew chiefs",
      "football",
      AVAILABLE_SPORTS
    );

    expect(result.mode).toBe("sport_family");
    expect(result.sports).toEqual(["msoccer", "wsoccer"]);
  });
});
