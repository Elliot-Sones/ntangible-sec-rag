import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadSeededModule } from "./load-seeded-module.ts";
import { extractStaticDocuments, type StaticDocument } from "./static-extract.ts";

export interface SnapshotSport {
  sportId: string;
  label: string;
  roles: string[];
  crewSize: number;
  poolSize: number;
}

export interface SnapshotPerson {
  snapshotId: string;
  personId: string;
  personType: "official" | "recruit";
  name: string;
  sportId: string;
  sportLabel: string;
  position: string;
  level: string;
  round: string;
  clutchFactor: number;
  fitScore: number | null;
  status: string;
  inviteStatus: string | null;
  campStatus: string | null;
  dateInvited: string | null;
  lastTestedDate: string;
}

export interface SnapshotCrewChief {
  snapshotId: string;
  crewChiefId: string;
  sportId: string;
  sportLabel: string;
  name: string;
  answers: string[];
}

export interface SnapshotDrill {
  snapshotId: string;
  drillId: string;
  title: string;
  breakdown: string;
  insight: string;
  videoUrl: string | null;
}

export interface SnapshotAlignmentScore {
  snapshotId: string;
  officialId: string;
  crewChiefId: string;
  sportId: string;
  alignmentScore: number;
  cohort: string;
}

export interface SnapshotDocument {
  snapshotId: string;
  title: string;
  content: string;
  docType: string;
  sportId: string | null;
  metadata: Record<string, unknown>;
  provenance: "static_copy" | "generated_seeded" | "derived_seeded";
}

export interface SecDemoSnapshot {
  snapshotId: string;
  seed: number;
  sports: SnapshotSport[];
  officials: SnapshotPerson[];
  recruits: SnapshotPerson[];
  crewChiefs: SnapshotCrewChief[];
  drills: SnapshotDrill[];
  derivedAlignmentScores: SnapshotAlignmentScore[];
  documents: SnapshotDocument[];
}

interface SnapshotOptions {
  sourceRoot: string;
  seed: number;
}

interface SourcePlayer {
  id: string;
  type: "roster" | "recruit";
  name: string;
  sport: string;
  position: string;
  level: string;
  round: string;
  clutchFactor: number;
  status: string;
  fitScore?: number;
  inviteStatus?: string;
  campStatus?: string;
  dateInvited?: string;
  lastTestedDate: string;
}

interface CrewChiefSource {
  id: string;
  name: string;
  sport: string;
  answers: string[];
}

interface DrillSource {
  id: string;
  title: string;
  breakdown: string;
  insight: string;
  videoUrl?: string;
}

interface StyleSource {
  name: string;
  description: string;
  strategy: string;
}

interface SnapshotModules {
  SPORT_OFFICIAL_CONFIG: Record<string, { roles: string[]; crewSize: number; poolSize: number }>;
  ALL_ROSTERS: Record<string, SourcePlayer[]>;
}

interface RecruitModules {
  RECRUIT_PLAYERS: SourcePlayer[];
}

interface CrewModules {
  CREW_CHIEFS_BY_SPORT: Record<string, CrewChiefSource[]>;
  computeAlignmentScore: (officialId: string, officialFitSeed: number, crewChiefAnswers: string[]) => number;
}

interface InsightModules {
  DRILLS: DrillSource[];
  COMMUNICATION_STYLES: StyleSource[];
  DECISION_MAKING_STYLES: StyleSource[];
  PRESSURE_RESPONSES: StyleSource[];
  getPlayerProfile: (player: SourcePlayer) => {
    communication: StyleSource;
    decisionMaking: StyleSource;
    pressureResponse: StyleSource;
  };
  getPlayerPrescribedDrills: (player: SourcePlayer, count?: number) => DrillSource[];
}

const SPORT_LABELS: Record<string, string> = {
  football: "Football",
  baseball: "Baseball",
  softball: "Softball",
  mbball: "Men's Basketball",
  wbball: "Women's Basketball",
  msoccer: "Men's Soccer",
  wsoccer: "Women's Soccer",
  mvolleyball: "Men's Volleyball",
  wvolleyball: "Women's Volleyball",
  hockey: "Hockey"
};

export async function buildSecDemoSnapshot(options: SnapshotOptions): Promise<SecDemoSnapshot> {
  const { sourceRoot, seed } = options;
  const snapshotId = `secdemo_seed_${seed}`;
  const isolatedSourceRoot = await createIsolatedSourceRoot(sourceRoot);

  try {
    const [rosterModules, recruitModules, crewModules, insightModules, staticDocuments] = await Promise.all([
      loadSeededModule<SnapshotModules>(path.join(isolatedSourceRoot, "mockRoster.ts"), seed),
      loadSeededModule<RecruitModules>(path.join(isolatedSourceRoot, "mockRecruits.ts"), seed + 1),
      loadSeededModule<CrewModules>(path.join(isolatedSourceRoot, "mockCrewChiefs.ts"), seed + 2),
      loadSeededModule<InsightModules>(path.join(isolatedSourceRoot, "utils/playerInsights.ts"), seed + 3),
      extractStaticDocuments(sourceRoot)
    ]);

    const sports = Object.entries(rosterModules.SPORT_OFFICIAL_CONFIG).map(([sportId, config]) => ({
      sportId,
      label: SPORT_LABELS[sportId] ?? sportId,
      roles: config.roles,
      crewSize: config.crewSize,
      poolSize: config.poolSize
    }));

    const sportById = new Map(sports.map((sport) => [sport.sportId, sport]));

    const officials = Object.values(rosterModules.ALL_ROSTERS)
      .flat()
      .map((player) => materializePerson(snapshotId, player, "official", sportById));

    const recruits = recruitModules.RECRUIT_PLAYERS.map((player) =>
      materializePerson(snapshotId, player, "recruit", sportById)
    );

    const crewChiefs = Object.entries(crewModules.CREW_CHIEFS_BY_SPORT)
      .flatMap(([sportId, chiefs]) =>
        chiefs.map((chief) => ({
          snapshotId,
          crewChiefId: chief.id,
          sportId,
          sportLabel: SPORT_LABELS[sportId] ?? sportId,
          name: chief.name,
          answers: chief.answers
        }))
      );

    const drills = insightModules.DRILLS.map((drill) => ({
      snapshotId,
      drillId: drill.id,
      title: drill.title,
      breakdown: drill.breakdown,
      insight: drill.insight,
      videoUrl: drill.videoUrl ?? null
    }));

    const derivedAlignmentScores = buildAlignmentScores(snapshotId, officials, crewChiefs, crewModules.computeAlignmentScore);

    const documents = buildDocuments({
      snapshotId,
      sports,
      officials,
      recruits,
      crewChiefs,
      drills,
      staticDocuments,
      getPlayerProfile: insightModules.getPlayerProfile,
      getPlayerPrescribedDrills: insightModules.getPlayerPrescribedDrills,
      alignmentScores: derivedAlignmentScores,
      communicationStyles: insightModules.COMMUNICATION_STYLES,
      decisionMakingStyles: insightModules.DECISION_MAKING_STYLES,
      pressureResponses: insightModules.PRESSURE_RESPONSES
    });

    return {
      snapshotId,
      seed,
      sports,
      officials,
      recruits,
      crewChiefs,
      drills,
      derivedAlignmentScores,
      documents
    };
  } finally {
    await fs.rm(isolatedSourceRoot, { recursive: true, force: true });
  }
}

async function createIsolatedSourceRoot(sourceRoot: string): Promise<string> {
  const isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ntangible-sec-rag-"));
  const filesToCopy = [
    "types.ts",
    "mockRoster.ts",
    "mockRecruits.ts",
    "mockCrewChiefs.ts",
    path.join("utils", "playerInsights.ts")
  ];

  for (const relativeFile of filesToCopy) {
    const sourceFile = path.join(sourceRoot, relativeFile);
    const targetFile = path.join(isolatedRoot, relativeFile);

    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.copyFile(sourceFile, targetFile);
  }

  return isolatedRoot;
}

function materializePerson(
  snapshotId: string,
  player: SourcePlayer,
  personType: "official" | "recruit",
  sportById: Map<string, SnapshotSport>
): SnapshotPerson {
  const sport = sportById.get(player.sport);
  return {
    snapshotId,
    personId: player.id,
    personType,
    name: player.name,
    sportId: player.sport,
    sportLabel: sport?.label ?? player.sport,
    position: player.position,
    level: player.level,
    round: player.round,
    clutchFactor: player.clutchFactor,
    fitScore: player.fitScore ?? null,
    status: player.status,
    inviteStatus: player.inviteStatus ?? null,
    campStatus: player.campStatus ?? null,
    dateInvited: player.dateInvited ?? null,
    lastTestedDate: player.lastTestedDate
  };
}

function buildAlignmentScores(
  snapshotId: string,
  officials: SnapshotPerson[],
  crewChiefs: SnapshotCrewChief[],
  computeAlignmentScore: (officialId: string, officialFitSeed: number, crewChiefAnswers: string[]) => number
): SnapshotAlignmentScore[] {
  const chiefsBySport = new Map<string, SnapshotCrewChief[]>();
  for (const chief of crewChiefs) {
    const current = chiefsBySport.get(chief.sportId) ?? [];
    current.push(chief);
    chiefsBySport.set(chief.sportId, current);
  }

  const scores: SnapshotAlignmentScore[] = [];
  for (const official of officials) {
    const chiefs = chiefsBySport.get(official.sportId) ?? [];
    for (const chief of chiefs) {
      const alignmentScore = computeAlignmentScore(official.personId, official.fitScore ?? 50, chief.answers);
      scores.push({
        snapshotId,
        officialId: official.personId,
        crewChiefId: chief.crewChiefId,
        sportId: official.sportId,
        alignmentScore,
        cohort: alignmentCohort(official.clutchFactor, alignmentScore)
      });
    }
  }

  return scores;
}

function alignmentCohort(clutchFactor: number, alignmentScore: number): string {
  if (clutchFactor >= 750 && alignmentScore >= 62.5) return "Elite Officials";
  if (clutchFactor >= 750 && alignmentScore < 62.5) return "High Variance";
  if (clutchFactor < 750 && alignmentScore >= 62.5) return "Foundation Officials";
  return "At Risk";
}

function buildDocuments(input: {
  snapshotId: string;
  sports: SnapshotSport[];
  officials: SnapshotPerson[];
  recruits: SnapshotPerson[];
  crewChiefs: SnapshotCrewChief[];
  drills: SnapshotDrill[];
  staticDocuments: StaticDocument[];
  getPlayerProfile: InsightModules["getPlayerProfile"];
  getPlayerPrescribedDrills: InsightModules["getPlayerPrescribedDrills"];
  alignmentScores: SnapshotAlignmentScore[];
  communicationStyles: StyleSource[];
  decisionMakingStyles: StyleSource[];
  pressureResponses: StyleSource[];
}): SnapshotDocument[] {
  const documents: SnapshotDocument[] = [];
  const allPeople = [...input.officials, ...input.recruits];
  const peopleBySport = groupBy(allPeople, (person) => person.sportId);
  const alignmentByOfficial = groupBy(input.alignmentScores, (score) => score.officialId);

  for (const sport of input.sports) {
    const sportPeople = peopleBySport.get(sport.sportId) ?? [];
    const topClutch = [...sportPeople].sort((a, b) => b.clutchFactor - a.clutchFactor)[0];
    const averageClutch = average(sportPeople.map((person) => person.clutchFactor));
    const averageFit = average(sportPeople.map((person) => person.fitScore ?? 0));

    documents.push({
      snapshotId: input.snapshotId,
      title: `${sport.label} Snapshot Summary`,
      content: `${sport.label} has ${sport.poolSize} roster officials, crew size ${sport.crewSize}, and roles ${sport.roles.join(", ")}. Average clutch factor in the seeded snapshot is ${averageClutch.toFixed(1)} and average fit score is ${averageFit.toFixed(1)}. Top clutch profile is ${topClutch?.name ?? "n/a"} at ${topClutch?.clutchFactor ?? 0}.`,
      docType: "sport_summary",
      sportId: sport.sportId,
      metadata: { roles: sport.roles },
      provenance: "derived_seeded"
    });
  }

  for (const person of allPeople) {
    const sourcePlayer = toSourcePlayer(person);
    const profile = input.getPlayerProfile(sourcePlayer);
    const prescribedDrills = input.getPlayerPrescribedDrills(sourcePlayer, 2);
    const sportPeers = peopleBySport.get(person.sportId) ?? [];
    const clutchRank = rankDescending(sportPeers, person.personId, (item) => item.clutchFactor);
    const fitRank = rankDescending(sportPeers.filter((peer) => peer.fitScore !== null), person.personId, (item) => item.fitScore ?? 0);
    const alignments = [...(alignmentByOfficial.get(person.personId) ?? [])].sort((a, b) => b.alignmentScore - a.alignmentScore);
    const bestAlignment = alignments[0];

    documents.push({
      snapshotId: input.snapshotId,
      title: `${person.name} ${person.sportLabel} ${person.personType}`,
      content: `${person.name} is a ${person.personType} in ${person.sportLabel}. Position: ${person.position}. Level: ${person.level}. Round: ${person.round}. Clutch factor: ${person.clutchFactor}. Fit score: ${person.fitScore ?? "n/a"}. Status: ${person.status}. Sport clutch rank: ${clutchRank} of ${sportPeers.length}. Sport fit rank: ${fitRank === null ? "n/a" : `${fitRank} of ${sportPeers.filter((peer) => peer.fitScore !== null).length}`}. Communication style: ${profile.communication.name}. Decision-making style: ${profile.decisionMaking.name}. Pressure response: ${profile.pressureResponse.name}. Prescribed drills: ${prescribedDrills.map((drill) => drill.title).join(", ")}. Best crew chief alignment: ${bestAlignment ? `${bestAlignment.alignmentScore} with ${bestAlignment.crewChiefId}` : "n/a"}.`,
      docType: person.personType,
      sportId: person.sportId,
      metadata: {
        personId: person.personId,
        clutchFactor: person.clutchFactor,
        fitScore: person.fitScore,
        position: person.position,
        prescribedDrillIds: prescribedDrills.map((drill) => drill.id)
      },
      provenance: person.personType === "official" ? "generated_seeded" : "generated_seeded"
    });
  }

  for (const chief of input.crewChiefs) {
    documents.push({
      snapshotId: input.snapshotId,
      title: `${chief.name} Crew Chief Profile`,
      content: `${chief.name} is a crew chief for ${chief.sportLabel}. Questionnaire answers: ${chief.answers.join(" | ")}`,
      docType: "crew_chief",
      sportId: chief.sportId,
      metadata: { crewChiefId: chief.crewChiefId },
      provenance: "static_copy"
    });
  }

  for (const drill of input.drills) {
    documents.push({
      snapshotId: input.snapshotId,
      title: drill.title,
      content: `${drill.breakdown}\nCoach insight: ${drill.insight}`,
      docType: "drill",
      sportId: null,
      metadata: { drillId: drill.drillId, videoUrl: drill.videoUrl },
      provenance: "static_copy"
    });
  }

  for (const doc of input.staticDocuments) {
    documents.push({
      snapshotId: input.snapshotId,
      title: doc.title,
      content: doc.content,
      docType: doc.docType,
      sportId: doc.sportId ?? null,
      metadata: doc.metadata,
      provenance: "static_copy"
    });
  }

  for (const style of input.communicationStyles) {
    documents.push(styleDocument(input.snapshotId, "communication_style", style));
  }
  for (const style of input.decisionMakingStyles) {
    documents.push(styleDocument(input.snapshotId, "decision_style", style));
  }
  for (const style of input.pressureResponses) {
    documents.push(styleDocument(input.snapshotId, "pressure_style", style));
  }

  return documents;
}

function styleDocument(snapshotId: string, docType: string, style: StyleSource): SnapshotDocument {
  return {
    snapshotId,
    title: `${style.name} ${docType.replace("_", " ")}`,
    content: `${style.name}. ${style.description} Coaching strategy: ${style.strategy}`,
    docType,
    sportId: null,
    metadata: { styleName: style.name },
    provenance: "static_copy"
  };
}

function toSourcePlayer(person: SnapshotPerson): SourcePlayer {
  return {
    id: person.personId,
    type: person.personType === "official" ? "roster" : "recruit",
    name: person.name,
    sport: person.sportId,
    position: person.position,
    level: person.level,
    round: person.round,
    clutchFactor: person.clutchFactor,
    status: person.status,
    fitScore: person.fitScore ?? undefined,
    inviteStatus: person.inviteStatus ?? undefined,
    campStatus: person.campStatus ?? undefined,
    dateInvited: person.dateInvited ?? undefined,
    lastTestedDate: person.lastTestedDate
  };
}

function rankDescending<T>(items: T[], targetId: string, metric: (item: T) => number): number | null {
  const ranked = [...items]
    .sort((left, right) => metric(right) - metric(left))
    .map((item, index) => ({ item, rank: index + 1 }));

  const found = ranked.find((entry) => (entry.item as SnapshotPerson).personId === targetId);
  return found?.rank ?? null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }
  return grouped;
}
