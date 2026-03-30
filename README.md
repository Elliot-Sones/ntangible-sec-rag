# NTangible SEC RAG

RAG-powered intelligence layer for the NTangible SEC Officials demo. Serves the exact SEC demo UI with a floating chat assistant that answers questions about officials, recruits, crew chiefs, drills, methodology, and alignment — backed by Voyage embeddings and Anthropic generation over a Neon Postgres database.

## Architecture

```
SEC Demo React App (public/)
  └── Chat widget overlay (vanilla JS)
        └── Express API (/api/chat, /api/sessions, /api/bootstrap)
              ├── Sport scoping (auto-detect or explicit)
              ├── People search (Neon SQL)
              ├── Semantic retrieval (Voyage embeddings → Neon pgvector)
              ├── Leaderboard queries (Neon SQL)
              └── Answer generation (Anthropic Claude)
```

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) Postgres project
- An [Anthropic](https://console.anthropic.com) API key
- A [Voyage AI](https://www.voyageai.com) API key
- The SEC demo source code (for seeding)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in your keys
cp .env.example .env.local

# 3. Seed the database (creates tables + imports snapshot + generates embeddings)
npm run seed

# 4. Start the server
npm run dev
```

Then open http://localhost:3084

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for answer generation |
| `ANTHROPIC_MODEL` | No | Model ID (default: `claude-sonnet-4-6`) |
| `VOYAGE_API_KEY` | Yes | Voyage AI key for embeddings |
| `VOYAGE_MODEL` | No | Embedding model (default: `voyage-3-large`) |
| `EMBEDDING_DIMENSIONS` | No | Vector dimensions (default: `1024`) |
| `SECDEMO_SOURCE_ROOT` | Yes | Path to the SECdemo-main source directory |
| `SNAPSHOT_SEED` | No | Deterministic seed for snapshot generation (default: `42`) |

## Database

The seed script creates these tables in Neon:

| Table | Purpose |
|---|---|
| `snapshots` | Versioned snapshot metadata |
| `sports` | 10 SEC sports |
| `people` | 325 officials + recruits with clutch/fit scores |
| `crew_chiefs` | 49 crew chiefs |
| `alignment_scores` | 1,210 crew chief ↔ official alignment pairings |
| `drills` | 14 training drills with video URLs |
| `documents` | 483 embedded retrieval documents (profiles, rubrics, methodology, summaries) |
| `chat_sessions` | Conversation sessions |
| `chat_messages` | Message history with metadata |

All 483 documents have Voyage embeddings. The seed is deterministic — same `SNAPSHOT_SEED` produces identical data.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with hot reload (port 3084) |
| `npm run start` | Start production server |
| `npm run seed` | Build snapshot from SEC demo source → seed Neon |
| `npm test` | Run tests |

## Project Structure

```
public/              Built SEC demo React app + chat widget overlay
  index.html         SEC demo UI + injected chat bubble/panel
  assets/            Vite-built JS bundle
  TeamLogos/         Sport team logo images

src/
  lib/
    chat/
      scope.ts       Sport detection from user questions
      service.ts     RAG pipeline: scope → search → retrieve → generate
    snapshot/
      build-snapshot.ts   Deterministic snapshot compiler
      static-extract.ts  Extracts methodology/rubric text from source
      rng.ts              Seeded PRNG
      load-seeded-module.ts  TypeScript source loader
    store/
      schema.ts      Neon table definitions
      seed.ts        Snapshot → Neon import + Voyage embedding
      query.ts       All DB queries (people, docs, leaderboards, sessions)
    config.ts        Env config loader
    db.ts            Neon connection

  routes/
    api.ts           Express route handlers

scripts/
  seed-db.ts         CLI entry point for seeding

server.ts            Express server entry point

docs/
  superpowers/
    specs/           Design spec
    plans/           Implementation plan
```

## How the Chat Works

1. User asks a question in the chat panel
2. **Sport scoping** — detects which sport(s) the question is about, using the selected sport in the UI as a hint
3. **People search** — finds matching officials/recruits by name in the scoped sport(s)
4. **Leaderboard** — if the question asks for rankings, queries the DB directly for top-N by clutch or fit
5. **Semantic retrieval** — embeds the question with Voyage, searches documents by vector similarity within scope
6. **Answer generation** — sends all evidence to Anthropic Claude with a system prompt that enforces sport scoping and factual grounding
7. **Response** — returns the answer, citations, follow-up suggestions, and recommended drill videos

## Rebuilding the Frontend

The `public/` directory contains a pre-built copy of the SEC demo React app. To rebuild from source:

```bash
cd /path/to/SECdemo-main
npm install
npx vite build
cp -R dist/* /path/to/ntangible-sec-rag/public/
```

Then the chat widget in `public/index.html` needs to be re-added after the `<div id="root"></div>` — it lives at the bottom of the file (everything after `<!-- NTangible Chat Widget -->`).

## Neon Project

Current Neon project: `jolly-river-79257711`

To use a different Neon project, just update `DATABASE_URL` in `.env.local` and re-run `npm run seed`.
