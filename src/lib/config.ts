import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

function readNumber(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: readNumber("PORT", 3084),
  databaseUrl: process.env.DATABASE_URL ?? "",
  voyageApiKey: process.env.VOYAGE_API_KEY ?? "",
  voyageModel: process.env.VOYAGE_MODEL ?? "voyage-3-large",
  embeddingDimensions: readNumber("EMBEDDING_DIMENSIONS", 1024),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6-20250514",
  secDemoSourceRoot: process.env.SECDEMO_SOURCE_ROOT ?? "/Users/elliot18/Downloads/SECdemo-main",
  snapshotSeed: readNumber("SNAPSHOT_SEED", 42)
};

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return config.databaseUrl;
}

export function hasEmbeddingsConfig(): boolean {
  return Boolean(config.voyageApiKey);
}

export function hasGenerationConfig(): boolean {
  return Boolean(config.anthropicApiKey);
}
