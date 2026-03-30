export const SCHEMA_STATEMENTS = [
  "CREATE EXTENSION IF NOT EXISTS vector",
  `
    CREATE TABLE IF NOT EXISTS snapshots (
      snapshot_id TEXT PRIMARY KEY,
      seed INTEGER NOT NULL,
      source_root TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS sports (
      snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
      sport_id TEXT NOT NULL,
      label TEXT NOT NULL,
      crew_size INTEGER NOT NULL,
      pool_size INTEGER NOT NULL,
      roles JSONB NOT NULL DEFAULT '[]'::jsonb,
      PRIMARY KEY (snapshot_id, sport_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS people (
      snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
      person_id TEXT NOT NULL,
      person_type TEXT NOT NULL,
      name TEXT NOT NULL,
      sport_id TEXT NOT NULL,
      sport_label TEXT NOT NULL,
      position TEXT NOT NULL,
      level TEXT NOT NULL,
      round TEXT NOT NULL,
      clutch_factor INTEGER NOT NULL,
      fit_score NUMERIC NULL,
      status TEXT NOT NULL,
      invite_status TEXT NULL,
      camp_status TEXT NULL,
      date_invited TEXT NULL,
      last_tested_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (snapshot_id, person_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS crew_chiefs (
      snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
      crew_chief_id TEXT NOT NULL,
      sport_id TEXT NOT NULL,
      sport_label TEXT NOT NULL,
      name TEXT NOT NULL,
      answers JSONB NOT NULL DEFAULT '[]'::jsonb,
      PRIMARY KEY (snapshot_id, crew_chief_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS drills (
      snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
      drill_id TEXT NOT NULL,
      title TEXT NOT NULL,
      breakdown TEXT NOT NULL,
      insight TEXT NOT NULL,
      video_url TEXT NULL,
      PRIMARY KEY (snapshot_id, drill_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS alignment_scores (
      snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
      official_id TEXT NOT NULL,
      crew_chief_id TEXT NOT NULL,
      sport_id TEXT NOT NULL,
      alignment_score NUMERIC NOT NULL,
      cohort TEXT NOT NULL,
      PRIMARY KEY (snapshot_id, official_id, crew_chief_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS documents (
      document_id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      sport_id TEXT NULL,
      provenance TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      embedding VECTOR(1024) NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS chat_sessions (
      session_id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      selected_sport TEXT NULL,
      last_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS chat_messages (
      message_id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations JSONB NOT NULL DEFAULT '[]'::jsonb,
      videos JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  "CREATE INDEX IF NOT EXISTS idx_people_snapshot_sport ON people(snapshot_id, sport_id, person_type)",
  "CREATE INDEX IF NOT EXISTS idx_people_name_lower ON people(LOWER(name))",
  "CREATE INDEX IF NOT EXISTS idx_documents_snapshot_sport ON documents(snapshot_id, sport_id, doc_type)",
  "CREATE INDEX IF NOT EXISTS idx_documents_person_id ON documents((metadata ->> 'personId'))",
  "CREATE INDEX IF NOT EXISTS idx_sessions_snapshot_updated ON chat_sessions(snapshot_id, updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_messages_session_created ON chat_messages(session_id, created_at ASC)"
] as const;
