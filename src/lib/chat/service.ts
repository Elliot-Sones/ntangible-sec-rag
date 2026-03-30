import { createRequire } from "node:module";

import Anthropic from "@anthropic-ai/sdk";

import { config, hasEmbeddingsConfig, hasGenerationConfig } from "../config.ts";
import {
  createSession,
  ensureSession,
  getActiveSnapshot,
  getLeaderboard,
  getSessionMessages,
  getVideosByDrillIds,
  saveConversationTurn,
  searchDocumentsByEmbedding,
  searchDocumentsByPersonIds,
  searchDocumentsByText,
  searchPeople,
  type Citation,
  type PersonRecord,
  type RecommendedVideo,
  type RetrievedDocument,
  type SessionSummary
} from "../store/query.ts";
import { detectSportScope, type SportScopeResult } from "./scope.ts";

const require = createRequire(import.meta.url);
const { VoyageAIClient } = require("voyageai") as {
  VoyageAIClient: new (options: { apiKey: string }) => {
    embed: (request: {
      input: string;
      model: string;
      inputType: "query";
      outputDimension: number;
      truncation: boolean;
    }) => Promise<{ data?: Array<{ embedding?: number[] }> }>;
  };
};

interface ChatRequest {
  message: string;
  sessionId: string | null;
  selectedSport: string | null;
}

export interface ChatResponsePayload {
  session: SessionSummary;
  answer: string;
  scope: SportScopeResult;
  citations: Citation[];
  videos: RecommendedVideo[];
  people: PersonRecord[];
  followUps: string[];
  clarificationNeeded: boolean;
}

interface LeaderboardResult {
  metric: "clutchFactor" | "fitScore" | null;
  direction: "asc" | "desc";
  rows: PersonRecord[];
}

const anthropic = hasGenerationConfig() ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;
const voyage = hasEmbeddingsConfig() ? new VoyageAIClient({ apiKey: config.voyageApiKey }) : null;

export async function createChatSession(selectedSport: string | null): Promise<SessionSummary> {
  const snapshot = await getActiveSnapshot();
  if (!snapshot) {
    throw new Error("No seeded snapshot found. Run the seed flow first.");
  }

  return createSession(snapshot.snapshotId, selectedSport);
}

export async function handleChat(request: ChatRequest): Promise<ChatResponsePayload> {
  const snapshot = await getActiveSnapshot();
  if (!snapshot) {
    throw new Error("No seeded snapshot found. Run the seed flow first.");
  }

  const availableSports = [
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

  const session = await ensureSession(snapshot.snapshotId, request.sessionId, request.selectedSport);
  let scope = detectSportScope(request.message, request.selectedSport, availableSports);
  let people = await searchPeople(snapshot.snapshotId, scope.mode === "fallback_all" ? null : scope.sports, request.message);

  if (scope.mode === "fallback_all") {
    if (people.length === 1) {
      scope = {
        mode: "explicit_sport",
        sports: [people[0].sportId],
        crossSport: false,
        reason: `derived from unique player match ${people[0].name}`
      };
    } else if (people.length === 0) {
      const clarification = `I can answer this, but I need the sport first so I keep the retrieval clean. Pick one like football, basketball, baseball, softball, soccer, volleyball, or hockey, or say you want a cross-sport comparison.`;
      await saveConversationTurn(
        session.sessionId,
        request.message,
        clarification,
        [],
        [],
        request.selectedSport,
        { ...scope, clarificationNeeded: true }
      );

      return {
        session: (await ensureSession(snapshot.snapshotId, session.sessionId, request.selectedSport)),
        answer: clarification,
        scope,
        citations: [],
        videos: [],
        people: [],
        followUps: [
          "Show me the top football officials by clutch factor",
          "Who stands out in women's basketball?",
          "Compare the top officials across all sports"
        ],
        clarificationNeeded: true
      };
    }
  }

  if (scope.mode !== "fallback_all") {
    people = await searchPeople(snapshot.snapshotId, scope.sports, request.message);
  }

  const leaderboard = await maybeBuildLeaderboard(snapshot.snapshotId, scope, request.message);
  const playerDocuments = await searchDocumentsByPersonIds(snapshot.snapshotId, people.map((person) => person.personId));
  const vectorDocuments = await searchSemanticDocuments(snapshot.snapshotId, scope, request.message);
  const documents = dedupeDocuments([...playerDocuments, ...vectorDocuments]).slice(0, 8);
  const videos = await collectRecommendedVideos(snapshot.snapshotId, playerDocuments, documents);
  const citations = documents.slice(0, 4).map((document) => ({
    title: document.title,
    docType: document.docType,
    sportId: document.sportId,
    similarity: document.similarity
  }));

  const history = await getSessionMessages(session.sessionId);
  const answer = await generateAnswer({
    message: request.message,
    scope,
    people,
    documents,
    leaderboard,
    videos,
    history
  });

  await saveConversationTurn(
    session.sessionId,
    request.message,
    answer,
    citations,
    videos,
    request.selectedSport,
    {
      ...scope,
      matchedPeople: people.map((person) => person.personId),
      citations: citations.map((citation) => citation.title)
    }
  );

  return {
    session: (await ensureSession(snapshot.snapshotId, session.sessionId, request.selectedSport)),
    answer,
    scope,
    citations,
    videos,
    people,
    followUps: buildFollowUps(scope, people),
    clarificationNeeded: false
  };
}

async function searchSemanticDocuments(
  snapshotId: string,
  scope: SportScopeResult,
  message: string
): Promise<RetrievedDocument[]> {
  if (voyage) {
    const response = await voyage.embed({
      input: message,
      model: config.voyageModel,
      inputType: "query",
      outputDimension: config.embeddingDimensions,
      truncation: true
    });

    const vector = response.data?.[0]?.embedding;
    if (vector && vector.length > 0) {
      const literal = `[${vector.join(",")}]`;
      return searchDocumentsByEmbedding(snapshotId, scope.sports, literal);
    }
  }

  return searchDocumentsByText(snapshotId, scope.sports, message);
}

async function maybeBuildLeaderboard(
  snapshotId: string,
  scope: SportScopeResult,
  message: string
): Promise<LeaderboardResult> {
  const normalized = message.toLowerCase();
  const wantsRanking = /\b(top|highest|best|lowest|bottom|worst|leader|leaders|rank)\b/.test(normalized);
  if (!wantsRanking) {
    return { metric: null, direction: "desc", rows: [] };
  }

  const metric =
    /\b(fit|alignment)\b/.test(normalized) ? "fit_score" :
    /\b(clutch|pressure|composure)\b/.test(normalized) ? "clutch_factor" :
    null;

  if (!metric) {
    return { metric: null, direction: "desc", rows: [] };
  }

  const direction = /\b(lowest|bottom|worst)\b/.test(normalized) ? "asc" : "desc";
  const numericMatch = normalized.match(/\btop\s+(\d+)\b/);
  const limit = numericMatch ? Math.min(Number.parseInt(numericMatch[1], 10), 10) : 5;
  const rows = await getLeaderboard(snapshotId, scope.sports, metric, direction, limit);

  return {
    metric: metric === "clutch_factor" ? "clutchFactor" : "fitScore",
    direction,
    rows
  };
}

async function collectRecommendedVideos(
  snapshotId: string,
  playerDocuments: RetrievedDocument[],
  documents: RetrievedDocument[]
): Promise<RecommendedVideo[]> {
  const drillIds = new Set<string>();

  for (const document of playerDocuments) {
    const ids = Array.isArray(document.metadata.prescribedDrillIds)
      ? (document.metadata.prescribedDrillIds as unknown[])
      : [];

    for (const value of ids) {
      if (typeof value === "string") {
        drillIds.add(value);
      }
    }
  }

  for (const document of documents) {
    const drillId = document.metadata.drillId;
    if (typeof drillId === "string") {
      drillIds.add(drillId);
    }
  }

  return (await getVideosByDrillIds(snapshotId, [...drillIds])).slice(0, 3);
}

function dedupeDocuments(documents: RetrievedDocument[]): RetrievedDocument[] {
  const seen = new Set<string>();
  const deduped: RetrievedDocument[] = [];

  for (const document of documents) {
    if (seen.has(document.documentId)) continue;
    seen.add(document.documentId);
    deduped.push(document);
  }

  return deduped;
}

async function generateAnswer(input: {
  message: string;
  scope: SportScopeResult;
  people: PersonRecord[];
  documents: RetrievedDocument[];
  leaderboard: LeaderboardResult;
  videos: RecommendedVideo[];
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const fallback = buildFallbackAnswer(input);
  if (!anthropic) {
    return fallback;
  }

  const evidence = {
    scope: input.scope,
    matchedPeople: input.people,
    leaderboard: input.leaderboard,
    documents: input.documents.map((document) => ({
      title: document.title,
      docType: document.docType,
      sportId: document.sportId,
      content: document.content,
      metadata: document.metadata,
      similarity: document.similarity
    })),
    videos: input.videos
  };

  const systemPrompt =
    "You are the SEC sport intelligence assistant. Only answer from the provided evidence. Keep answers scoped to the supplied sports unless the scope says cross_sport. Be explicit when evidence is missing. If player metrics are provided, use the numbers exactly. Mention recommended videos only when the evidence contains them.";

  const messages: Anthropic.MessageParam[] = [
    ...input.history.slice(-6).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content
    })),
    {
      role: "user",
      content: `Question: ${input.message}\n\nEvidence JSON:\n${JSON.stringify(evidence)}`
    }
  ];

  const response = await anthropic.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    temperature: 0.2,
    system: systemPrompt,
    messages
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text.trim() : fallback;
}

function buildFallbackAnswer(input: {
  message: string;
  scope: SportScopeResult;
  people: PersonRecord[];
  documents: RetrievedDocument[];
  leaderboard: LeaderboardResult;
  videos: RecommendedVideo[];
}): string {
  const sections: string[] = [];

  if (input.people.length === 1) {
    const person = input.people[0];
    sections.push(
      `${person.name} is in ${person.sportLabel} as a ${person.personType}. Clutch factor: ${person.clutchFactor}. Fit score: ${person.fitScore ?? "n/a"}. Position: ${person.position}. Level: ${person.level}.`
    );
  } else if (input.people.length > 1) {
    sections.push(`I found multiple matching people in scope: ${input.people.map((person) => `${person.name} (${person.sportLabel})`).join(", ")}.`);
  }

  if (input.leaderboard.rows.length > 0 && input.leaderboard.metric) {
    const metricLabel = input.leaderboard.metric === "clutchFactor" ? "clutch factor" : "fit score";
    const leaderboardLine = input.leaderboard.rows
      .map((row, index) => `${index + 1}. ${row.name} (${row.sportLabel}) - ${metricLabel === "clutch factor" ? row.clutchFactor : row.fitScore ?? "n/a"}`)
      .join("\n");
    sections.push(`Top results by ${metricLabel}:\n${leaderboardLine}`);
  }

  if (input.documents.length > 0) {
    const supporting = input.documents
      .slice(0, 3)
      .map((document) => `${document.title}: ${summarizeText(document.content)}`)
      .join("\n");
    sections.push(`Supporting evidence:\n${supporting}`);
  } else {
    sections.push("I did not find enough evidence in the scoped dataset to answer that cleanly.");
  }

  if (input.videos.length > 0) {
    sections.push(
      `Recommended videos:\n${input.videos.map((video) => `- ${video.title}: ${video.url}`).join("\n")}`
    );
  }

  return sections.join("\n\n");
}

function buildFollowUps(scope: SportScopeResult, people: PersonRecord[]): string[] {
  const followUps = new Set<string>();

  if (people[0]) {
    followUps.add(`Recommend videos for ${people[0].name}`);
    followUps.add(`Compare ${people[0].name} to the top clutch profile in ${people[0].sportLabel}`);
  }

  const scopeLabel = scope.crossSport ? "across all sports" : `in ${scope.sports.join(", ")}`;
  followUps.add(`Who has the highest clutch factor ${scopeLabel}?`);
  followUps.add(`What rules or methodology matter most ${scopeLabel}?`);

  return [...followUps].slice(0, 3);
}

function summarizeText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}
