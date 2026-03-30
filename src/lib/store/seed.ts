import { createRequire } from "node:module";

import { config, hasEmbeddingsConfig } from "../config.ts";
import { getDb } from "../db.ts";
import {
  buildSecDemoSnapshot,
  type SecDemoSnapshot,
  type SnapshotDocument,
} from "../snapshot/build-snapshot.ts";
import { SCHEMA_STATEMENTS } from "./schema.ts";

const require = createRequire(import.meta.url);
const { VoyageAIClient } = require("voyageai") as {
  VoyageAIClient: new (options: { apiKey: string }) => {
    embed: (request: {
      input: string[];
      model: string;
      inputType: "document";
      outputDimension: number;
      truncation: boolean;
    }) => Promise<{ data?: Array<{ embedding?: number[] }> }>;
  };
};

interface SeedOptions {
  sourceRoot?: string;
  seed?: number;
}

export interface SeedResult {
  snapshotId: string;
  seed: number;
  counts: {
    sports: number;
    people: number;
    crewChiefs: number;
    drills: number;
    alignmentScores: number;
    documents: number;
  };
  embeddingsApplied: boolean;
}

interface InsertColumn<Row> {
  name: string;
  cast?: string;
  value: (row: Row, index: number) => unknown;
}

export async function ensureSchema(): Promise<void> {
  const sql = getDb();

  for (const statement of SCHEMA_STATEMENTS) {
    await sql.query(statement);
  }
}

export async function seedDatabase(options: SeedOptions = {}): Promise<SeedResult> {
  const snapshot = await buildSecDemoSnapshot({
    sourceRoot: options.sourceRoot ?? config.secDemoSourceRoot,
    seed: options.seed ?? config.snapshotSeed
  });

  await ensureSchema();
  await replaceSnapshot(snapshot, options.sourceRoot ?? config.secDemoSourceRoot);

  return {
    snapshotId: snapshot.snapshotId,
    seed: snapshot.seed,
    counts: {
      sports: snapshot.sports.length,
      people: snapshot.officials.length + snapshot.recruits.length,
      crewChiefs: snapshot.crewChiefs.length,
      drills: snapshot.drills.length,
      alignmentScores: snapshot.derivedAlignmentScores.length,
      documents: snapshot.documents.length
    },
    embeddingsApplied: hasEmbeddingsConfig()
  };
}

async function replaceSnapshot(snapshot: SecDemoSnapshot, sourceRoot: string): Promise<void> {
  const sql = getDb();
  const embeddedDocuments = await embedDocuments(snapshot.documents);

  await sql.query("DELETE FROM snapshots WHERE snapshot_id = $1", [snapshot.snapshotId]);
  await sql.query(
    "INSERT INTO snapshots (snapshot_id, seed, source_root) VALUES ($1, $2, $3)",
    [snapshot.snapshotId, snapshot.seed, sourceRoot]
  );

  await insertRows("sports", snapshot.sports, [
    { name: "snapshot_id", value: () => snapshot.snapshotId },
    { name: "sport_id", value: (row) => row.sportId },
    { name: "label", value: (row) => row.label },
    { name: "crew_size", value: (row) => row.crewSize },
    { name: "pool_size", value: (row) => row.poolSize },
    { name: "roles", cast: "jsonb", value: (row) => JSON.stringify(row.roles) }
  ]);

  await insertRows("people", [...snapshot.officials, ...snapshot.recruits], [
    { name: "snapshot_id", value: (row) => row.snapshotId },
    { name: "person_id", value: (row) => row.personId },
    { name: "person_type", value: (row) => row.personType },
    { name: "name", value: (row) => row.name },
    { name: "sport_id", value: (row) => row.sportId },
    { name: "sport_label", value: (row) => row.sportLabel },
    { name: "position", value: (row) => row.position },
    { name: "level", value: (row) => row.level },
    { name: "round", value: (row) => row.round },
    { name: "clutch_factor", value: (row) => row.clutchFactor },
    { name: "fit_score", value: (row) => row.fitScore },
    { name: "status", value: (row) => row.status },
    { name: "invite_status", value: (row) => row.inviteStatus },
    { name: "camp_status", value: (row) => row.campStatus },
    { name: "date_invited", value: (row) => row.dateInvited },
    { name: "last_tested_at", value: (row) => row.lastTestedDate }
  ]);

  await insertRows("crew_chiefs", snapshot.crewChiefs, [
    { name: "snapshot_id", value: (row) => row.snapshotId },
    { name: "crew_chief_id", value: (row) => row.crewChiefId },
    { name: "sport_id", value: (row) => row.sportId },
    { name: "sport_label", value: (row) => row.sportLabel },
    { name: "name", value: (row) => row.name },
    { name: "answers", cast: "jsonb", value: (row) => JSON.stringify(row.answers) }
  ]);

  await insertRows("drills", snapshot.drills, [
    { name: "snapshot_id", value: (row) => row.snapshotId },
    { name: "drill_id", value: (row) => row.drillId },
    { name: "title", value: (row) => row.title },
    { name: "breakdown", value: (row) => row.breakdown },
    { name: "insight", value: (row) => row.insight },
    { name: "video_url", value: (row) => row.videoUrl }
  ]);

  await insertRows("alignment_scores", snapshot.derivedAlignmentScores, [
    { name: "snapshot_id", value: (row) => row.snapshotId },
    { name: "official_id", value: (row) => row.officialId },
    { name: "crew_chief_id", value: (row) => row.crewChiefId },
    { name: "sport_id", value: (row) => row.sportId },
    { name: "alignment_score", value: (row) => row.alignmentScore },
    { name: "cohort", value: (row) => row.cohort }
  ]);

  await insertRows("documents", embeddedDocuments, [
    { name: "document_id", value: (_, index) => `${snapshot.snapshotId}-doc-${index}` },
    { name: "snapshot_id", value: (row) => row.snapshotId },
    { name: "title", value: (row) => row.title },
    { name: "content", value: (row) => row.content },
    { name: "doc_type", value: (row) => row.docType },
    { name: "sport_id", value: (row) => row.sportId },
    { name: "provenance", value: (row) => row.provenance },
    { name: "metadata", cast: "jsonb", value: (row) => JSON.stringify(row.metadata) },
    { name: "embedding", cast: "vector", value: (row) => toVectorLiteral(row.embedding) }
  ]);
}

async function embedDocuments(documents: SnapshotDocument[]): Promise<Array<SnapshotDocument & { embedding: number[] | null }>> {
  if (!hasEmbeddingsConfig()) {
    return documents.map((document) => ({ ...document, embedding: null }));
  }

  const client = new VoyageAIClient({ apiKey: config.voyageApiKey });
  const embedded: Array<SnapshotDocument & { embedding: number[] | null }> = [];

  for (let start = 0; start < documents.length; start += 32) {
    const batch = documents.slice(start, start + 32);
    const response = await client.embed({
      input: batch.map((document) => `${document.title}\n\n${document.content}`),
      model: config.voyageModel,
      inputType: "document",
      outputDimension: config.embeddingDimensions,
      truncation: true
    });
    const embeddings = response.data ?? [];

    for (let index = 0; index < batch.length; index += 1) {
      embedded.push({
        ...batch[index],
        embedding: embeddings[index]?.embedding ?? null
      });
    }
  }

  return embedded;
}

async function insertRows<Row>(
  tableName: string,
  rows: Row[],
  columns: Array<InsertColumn<Row>>
): Promise<void> {
  if (rows.length === 0) return;

  const sql = getDb();
  const chunkSize = 100;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params: unknown[] = [];
    const valuesSql = chunk
      .map((row, rowIndex) => {
        const placeholders = columns.map((column) => {
          params.push(column.value(row, start + rowIndex));
          const placeholderIndex = params.length;
          return column.cast ? `$${placeholderIndex}::${column.cast}` : `$${placeholderIndex}`;
        });
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");

    const query = `INSERT INTO ${tableName} (${columns.map((column) => column.name).join(", ")}) VALUES ${valuesSql}`;
    await sql.query(query, params);
  }
}

function toVectorLiteral(embedding: number[] | null | undefined): string | null {
  if (!embedding || embedding.length === 0) return null;
  return `[${embedding.join(",")}]`;
}
