export interface SportScopeResult {
  mode: "cross_sport" | "explicit_sport" | "sport_family" | "selected_sport" | "fallback_all";
  sports: string[];
  crossSport: boolean;
  reason: string;
}

const FAMILY_MAP: Record<string, string[]> = {
  basketball: ["mbball", "wbball"],
  soccer: ["msoccer", "wsoccer"],
  volleyball: ["mvolleyball", "wvolleyball"]
};

const EXPLICIT_SPORT_MATCHERS: Array<{ sport: string; pattern: RegExp }> = [
  { sport: "football", pattern: /\bfootball\b/ },
  { sport: "baseball", pattern: /\bbaseball\b/ },
  { sport: "softball", pattern: /\bsoftball\b/ },
  { sport: "hockey", pattern: /\bhockey\b/ },
  { sport: "mbball", pattern: /\b(men'?s basketball|mens basketball|male basketball|mbball)\b/ },
  { sport: "wbball", pattern: /\b(women'?s basketball|womens basketball|female basketball|wbball)\b/ },
  { sport: "msoccer", pattern: /\b(men'?s soccer|mens soccer|male soccer|msoccer)\b/ },
  { sport: "wsoccer", pattern: /\b(women'?s soccer|womens soccer|female soccer|wsoccer)\b/ },
  { sport: "mvolleyball", pattern: /\b(men'?s volleyball|mens volleyball|male volleyball|mvolleyball)\b/ },
  { sport: "wvolleyball", pattern: /\b(women'?s volleyball|womens volleyball|female volleyball|wvolleyball)\b/ }
];

export function detectSportScope(
  query: string,
  selectedSport: string | null,
  availableSports: string[]
): SportScopeResult {
  const normalizedQuery = query.toLowerCase();

  if (/\b(across all sports|across sports|all sports|cross[- ]sport|compare sports)\b/.test(normalizedQuery)) {
    return {
      mode: "cross_sport",
      sports: [...availableSports],
      crossSport: true,
      reason: "explicit cross-sport request"
    };
  }

  const explicitSports = EXPLICIT_SPORT_MATCHERS
    .filter((entry) => entry.pattern.test(normalizedQuery))
    .map((entry) => entry.sport)
    .filter((sport, index, sports) => sports.indexOf(sport) === index)
    .filter((sport) => availableSports.includes(sport));

  if (explicitSports.length > 0) {
    return {
      mode: "explicit_sport",
      sports: explicitSports,
      crossSport: explicitSports.length > 1,
      reason: "explicit sport mention"
    };
  }

  for (const [family, sports] of Object.entries(FAMILY_MAP)) {
    if (normalizedQuery.includes(family)) {
      const filteredSports = sports.filter((sport) => availableSports.includes(sport));
      return {
        mode: "sport_family",
        sports: filteredSports,
        crossSport: false,
        reason: `${family} family detected`
      };
    }
  }

  if (selectedSport && availableSports.includes(selectedSport)) {
    return {
      mode: "selected_sport",
      sports: [selectedSport],
      crossSport: false,
      reason: "selected UI scope"
    };
  }

  return {
    mode: "fallback_all",
    sports: [...availableSports],
    crossSport: true,
    reason: "no explicit sport found"
  };
}
