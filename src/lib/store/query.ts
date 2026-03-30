import { randomUUID } from "node:crypto";

import { getDb } from "../db.ts";

export interface ActiveSnapshot {
  snapshotId: string;
  seed: number;
  createdAt: string;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  selectedSport: string | null;
  updatedAt: string;
}

export interface SessionMessage {
  messageId: number;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  videos: RecommendedVideo[];
  createdAt: string;
}

export interface SportSummary {
  sportId: string;
  label: string;
  crewSize: number;
  poolSize: number;
  peopleCount: number;
  topClutchName: string | null;
  topClutchFactor: number | null;
}

export interface PersonRecord {
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
}

export interface RetrievedDocument {
  documentId: string;
  title: string;
  content: string;
  docType: string;
  sportId: string | null;
  provenance: string;
  metadata: Record<string, unknown>;
  similarity: number | null;
}

export interface RecommendedVideo {
  title: string;
  url: string;
  drillId: string;
}

export interface Citation {
  title: string;
  docType: string;
  sportId: string | null;
  similarity: number | null;
}

export interface BootstrapPayload {
  snapshot: ActiveSnapshot | null;
  sports: SportSummary[];
  sessions: SessionSummary[];
}

export async function getBootstrapPayload(): Promise<BootstrapPayload> {
  const snapshot = await getActiveSnapshot();
  if (!snapshot) {
    return { snapshot: null, sports: [], sessions: [] };
  }

  const [sports, sessions] = await Promise.all([
    getSportSummaries(snapshot.snapshotId),
    listSessions(snapshot.snapshotId)
  ]);

  return { snapshot, sports, sessions };
}

export async function getActiveSnapshot(): Promise<ActiveSnapshot | null> {
  const sql = getDb();
  const rows = await sql.query(
    `
      SELECT snapshot_id, seed, created_at
      FROM snapshots
      ORDER BY created_at DESC
      LIMIT 1
    `
  );

  const row = rows[0];
  if (!row) return null;

  return {
    snapshotId: row.snapshot_id,
    seed: Number(row.seed),
    createdAt: row.created_at
  };
}

export async function getSportSummaries(snapshotId: string): Promise<SportSummary[]> {
  const sql = getDb();
  const [sports, people] = await Promise.all([
    sql.query(
      `
        SELECT sport_id, label, crew_size, pool_size
        FROM sports
        WHERE snapshot_id = $1
        ORDER BY label ASC
      `,
      [snapshotId]
    ),
    sql.query(
      `
        SELECT sport_id, name, clutch_factor
        FROM people
        WHERE snapshot_id = $1
        ORDER BY sport_id ASC, clutch_factor DESC, name ASC
      `,
      [snapshotId]
    )
  ]);

  const grouped = new Map<string, Array<{ name: string; clutchFactor: number }>>();
  for (const row of people) {
    const current = grouped.get(row.sport_id) ?? [];
    current.push({ name: row.name, clutchFactor: Number(row.clutch_factor) });
    grouped.set(row.sport_id, current);
  }

  return sports.map((row) => {
    const sportPeople = grouped.get(row.sport_id) ?? [];
    const leader = sportPeople[0] ?? null;
    return {
      sportId: row.sport_id,
      label: row.label,
      crewSize: Number(row.crew_size),
      poolSize: Number(row.pool_size),
      peopleCount: sportPeople.length,
      topClutchName: leader?.name ?? null,
      topClutchFactor: leader?.clutchFactor ?? null
    };
  });
}

export async function listSessions(snapshotId: string): Promise<SessionSummary[]> {
  const sql = getDb();
  const rows = await sql.query(
    `
      SELECT session_id, title, selected_sport, updated_at
      FROM chat_sessions
      WHERE snapshot_id = $1
      ORDER BY updated_at DESC
      LIMIT 12
    `,
    [snapshotId]
  );

  return rows.map((row) => ({
    sessionId: row.session_id,
    title: row.title,
    selectedSport: row.selected_sport,
    updatedAt: row.updated_at
  }));
}

export async function createSession(snapshotId: string, selectedSport: string | null): Promise<SessionSummary> {
  const sql = getDb();
  const sessionId = randomUUID();
  const title = selectedSport ? `${selectedSport} session` : "New SEC session";

  await sql.query(
    `
      INSERT INTO chat_sessions (session_id, snapshot_id, title, selected_sport)
      VALUES ($1, $2, $3, $4)
    `,
    [sessionId, snapshotId, title, selectedSport]
  );

  const session = await getSessionSummary(sessionId);
  if (!session) {
    throw new Error("Failed to create chat session.");
  }

  return session;
}

export async function ensureSession(snapshotId: string, sessionId: string | null, selectedSport: string | null): Promise<SessionSummary> {
  if (sessionId) {
    const existing = await getSessionSummary(sessionId);
    if (existing) {
      if (selectedSport !== existing.selectedSport) {
        await updateSessionScope(sessionId, selectedSport, {});
      }
      return (await getSessionSummary(sessionId)) ?? existing;
    }
  }

  return createSession(snapshotId, selectedSport);
}

export async function getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
  const sql = getDb();
  const rows = await sql.query(
    `
      SELECT session_id, title, selected_sport, updated_at
      FROM chat_sessions
      WHERE session_id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    title: row.title,
    selectedSport: row.selected_sport,
    updatedAt: row.updated_at
  };
}

export async function getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const sql = getDb();
  const rows = await sql.query(
    `
      SELECT message_id, role, content, citations, videos, created_at
      FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC, message_id ASC
    `,
    [sessionId]
  );

  return rows.map((row) => ({
    messageId: Number(row.message_id),
    role: row.role,
    content: row.content,
    citations: row.citations ?? [],
    videos: row.videos ?? [],
    createdAt: row.created_at
  }));
}

export async function saveConversationTurn(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  citations: Citation[],
  videos: RecommendedVideo[],
  selectedSport: string | null,
  scopePayload: Record<string, unknown>
): Promise<void> {
  const sql = getDb();

  await sql.query(
    `
      INSERT INTO chat_messages (session_id, role, content)
      VALUES ($1, 'user', $2)
    `,
    [sessionId, userMessage]
  );

  await sql.query(
    `
      INSERT INTO chat_messages (session_id, role, content, citations, videos)
      VALUES ($1, 'assistant', $2, $3::jsonb, $4::jsonb)
    `,
    [sessionId, assistantMessage, JSON.stringify(citations), JSON.stringify(videos)]
  );

  await updateSessionScope(sessionId, selectedSport, scopePayload);

  const title = buildSessionTitle(userMessage, selectedSport);
  await sql.query(
    `
      UPDATE chat_sessions
      SET title = COALESCE(NULLIF(title, 'New SEC session'), $2, title),
          updated_at = NOW()
      WHERE session_id = $1
    `,
    [sessionId, title]
  );
}

export async function updateSessionScope(
  sessionId: string,
  selectedSport: string | null,
  scopePayload: Record<string, unknown>
): Promise<void> {
  const sql = getDb();
  await sql.query(
    `
      UPDATE chat_sessions
      SET selected_sport = $2,
          last_scope = $3::jsonb,
          updated_at = NOW()
      WHERE session_id = $1
    `,
    [sessionId, selectedSport, JSON.stringify(scopePayload)]
  );
}

export async function searchPeople(
  snapshotId: string,
  sports: string[] | null,
  searchText: string,
  limit = 8
): Promise<PersonRecord[]> {
  const terms = extractSearchTerms(searchText);
  if (terms.length === 0) return [];

  const sql = getDb();
  const patterns = terms.map((term) => `%${term}%`);
  const rows = await sql.query(
    `
      SELECT snapshot_id, person_id, person_type, name, sport_id, sport_label, position, level, round,
             clutch_factor, fit_score, status, invite_status, camp_status
      FROM people
      WHERE snapshot_id = $1
        AND ($2::text[] IS NULL OR sport_id = ANY($2))
        AND LOWER(name) LIKE ANY($3::text[])
      LIMIT $4
    `,
    [snapshotId, sports && sports.length > 0 ? sports : null, patterns, limit * 3]
  );

  return rows
    .map((row) => ({
      snapshotId: row.snapshot_id,
      personId: row.person_id,
      personType: row.person_type,
      name: row.name,
      sportId: row.sport_id,
      sportLabel: row.sport_label,
      position: row.position,
      level: row.level,
      round: row.round,
      clutchFactor: Number(row.clutch_factor),
      fitScore: row.fit_score === null ? null : Number(row.fit_score),
      status: row.status,
      inviteStatus: row.invite_status,
      campStatus: row.camp_status
    }))
    .sort((left, right) => scoreNameMatch(right.name, terms) - scoreNameMatch(left.name, terms))
    .slice(0, limit);
}

export async function getLeaderboard(
  snapshotId: string,
  sports: string[] | null,
  metric: "clutch_factor" | "fit_score",
  direction: "asc" | "desc",
  limit: number
): Promise<PersonRecord[]> {
  const sql = getDb();
  const orderDirection = direction === "asc" ? "ASC" : "DESC";
  const rows = await sql.query(
    `
      SELECT snapshot_id, person_id, person_type, name, sport_id, sport_label, position, level, round,
             clutch_factor, fit_score, status, invite_status, camp_status
      FROM people
      WHERE snapshot_id = $1
        AND ($2::text[] IS NULL OR sport_id = ANY($2))
        AND ${metric} IS NOT NULL
      ORDER BY ${metric} ${orderDirection}, name ASC
      LIMIT $3
    `,
    [snapshotId, sports && sports.length > 0 ? sports : null, limit]
  );

  return rows.map((row) => ({
    snapshotId: row.snapshot_id,
    personId: row.person_id,
    personType: row.person_type,
    name: row.name,
    sportId: row.sport_id,
    sportLabel: row.sport_label,
    position: row.position,
    level: row.level,
    round: row.round,
    clutchFactor: Number(row.clutch_factor),
    fitScore: row.fit_score === null ? null : Number(row.fit_score),
    status: row.status,
    inviteStatus: row.invite_status,
    campStatus: row.camp_status
  }));
}

export async function searchDocumentsByPersonIds(
  snapshotId: string,
  personIds: string[]
): Promise<RetrievedDocument[]> {
  if (personIds.length === 0) return [];

  const sql = getDb();
  const rows = await sql.query(
    `
      SELECT document_id, title, content, doc_type, sport_id, provenance, metadata
      FROM documents
      WHERE snapshot_id = $1
        AND (metadata ->> 'personId') = ANY($2::text[])
    `,
    [snapshotId, personIds]
  );

  return rows.map((row) => ({
    documentId: row.document_id,
    title: row.title,
    content: row.content,
    docType: row.doc_type,
    sportId: row.sport_id,
    provenance: row.provenance,
    metadata: row.metadata ?? {},
    similarity: null
  }));
}

export async function searchDocumentsByEmbedding(
  snapshotId: string,
  sports: string[] | null,
  vectorLiteral: string,
  limit = 8
): Promise<RetrievedDocument[]> {
  const sql = getDb();
  const rows = await sql.query(
    `
      SELECT document_id, title, content, doc_type, sport_id, provenance, metadata,
             1 - (embedding <=> $3::vector) AS similarity
      FROM documents
      WHERE snapshot_id = $1
        AND ($2::text[] IS NULL OR sport_id IS NULL OR sport_id = ANY($2))
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $3::vector
      LIMIT $4
    `,
    [snapshotId, sports && sports.length > 0 ? sports : null, vectorLiteral, limit]
  );

  return rows.map((row) => ({
    documentId: row.document_id,
    title: row.title,
    content: row.content,
    docType: row.doc_type,
    sportId: row.sport_id,
    provenance: row.provenance,
    metadata: row.metadata ?? {},
    similarity: row.similarity === null ? null : Number(row.similarity)
  }));
}

export async function searchDocumentsByText(
  snapshotId: string,
  sports: string[] | null,
  queryText: string,
  limit = 8
): Promise<RetrievedDocument[]> {
  const terms = extractSearchTerms(queryText);
  if (terms.length === 0) return [];

  const sql = getDb();
  const patterns = terms.map((term) => `%${term}%`);
  const rows = await sql.query(
    `
      SELECT document_id, title, content, doc_type, sport_id, provenance, metadata
      FROM documents
      WHERE snapshot_id = $1
        AND ($2::text[] IS NULL OR sport_id IS NULL OR sport_id = ANY($2))
        AND (LOWER(title) LIKE ANY($3::text[]) OR LOWER(content) LIKE ANY($3::text[]))
      LIMIT $4
    `,
    [snapshotId, sports && sports.length > 0 ? sports : null, patterns, limit * 3]
  );

  return rows
    .map((row) => ({
      documentId: row.document_id,
      title: row.title,
      content: row.content,
      docType: row.doc_type,
      sportId: row.sport_id,
      provenance: row.provenance,
      metadata: row.metadata ?? {},
      similarity: scoreTextMatch(`${row.title} ${row.content}`, terms)
    }))
    .sort((left, right) => (right.similarity ?? 0) - (left.similarity ?? 0))
    .slice(0, limit);
}

export async function getVideosByDrillIds(snapshotId: string, drillIds: string[]): Promise<RecommendedVideo[]> {
  if (drillIds.length === 0) return [];

  const sql = getDb();
  const rows = await sql.query(
    `
      SELECT drill_id, title, video_url
      FROM drills
      WHERE snapshot_id = $1
        AND drill_id = ANY($2::text[])
        AND video_url IS NOT NULL
    `,
    [snapshotId, drillIds]
  );

  return rows.map((row) => ({
    title: row.title,
    url: row.video_url,
    drillId: row.drill_id
  }));
}

function buildSessionTitle(message: string, selectedSport: string | null): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  const title = trimmed.length > 48 ? `${trimmed.slice(0, 45)}...` : trimmed;
  if (!title) {
    return selectedSport ? `${selectedSport} session` : "New SEC session";
  }

  return title;
}

function extractSearchTerms(input: string): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "have",
    "what",
    "who",
    "when",
    "where",
    "which",
    "show",
    "give",
    "about",
    "into",
    "does",
    "please",
    "could",
    "would",
    "their",
    "across",
    "sports"
  ]);

  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !stopWords.has(term));
}

function scoreNameMatch(name: string, terms: string[]): number {
  const normalized = name.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function scoreTextMatch(text: string, terms: string[]): number {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}
