# NTangible SEC RAG Design

## Goal

Build a new desktop-local app that turns the SEC demo dataset into a Neon-backed, Voyage-embedded RAG with sport-specific answers by default, cross-sport answers when explicitly requested, and a chat UI/functionality patterned after the existing `Ntanglible_Rag` project.

## Constraints

- Source data comes from `/Users/elliot18/Downloads/SECdemo-main`.
- The app must live in a separate Desktop folder.
- The first dataset must be deterministic and reproducible from a fixed seed.
- Generated and derived data from the SEC demo must be preserved, not discarded.
- Answers must be sport-scoped by default so basketball questions do not pull baseball content.
- The app should recommend linked videos when drills or methodology content is relevant.

## Source Of Truth

The SEC demo source contains three categories of content:

1. Static source content
- Sport configuration
- Crew chief answer banks
- Drill library
- Fit and clutch rubric text
- Validation, methodology, and case-study copy
- External test and demo links

2. Generated content
- Roster officials
- Recruit prospects

3. Derived content
- Alignment scores against crew chiefs
- Cohort labels and signifiers
- NTerpret-style player profiles
- Prescribed drills
- Rankings and leaderboard summaries

V1 will treat all three as first-class dataset content, but will label each stored record with provenance so the app can distinguish between static, generated, and derived facts.

## Fixed-Seed Snapshot

The import pipeline will materialize a seeded snapshot from SEC demo source files.

- `static_copy`: text/rule/video/link content directly extracted from source files
- `generated_seeded`: roster and recruit rows generated from a deterministic seeded random source
- `derived_seeded`: alignment scores, rankings, signifiers, profiles, and prescribed drills computed from the seeded rows
- `render_verified`: optional later verification artifacts that confirm the UI matches the seeded source model

Every imported record belongs to one `snapshot_id`, making the dataset reproducible and queryable.

## Data Flow

1. Read SEC demo source files.
2. Import static data directly.
3. Override runtime randomness with a fixed seed while loading generated roster and recruit modules.
4. Recompute derived values from the seeded snapshot.
5. Build Neon records and retrieval documents from both raw and derived data.
6. Embed retrieval documents with Voyage.
7. Serve chat responses using sport routing, structured lookup, and vector retrieval.

## Storage Model

Neon will store:

- Snapshot metadata
- Sports and roles
- People records for officials and recruits
- Crew chief records
- Alignment score rows
- Drill and video records
- Retrieval documents with vector embeddings
- Conversation history

The app will answer from the frozen snapshot rather than re-running the SEC demo generators on every request.

## Retrieval Behavior

The chat system will route each question through sport scope detection before retrieval.

- If the user explicitly asks for cross-sport or all-sport results, retrieval can span multiple sports.
- If the user names a specific sport, retrieval is limited to that sport.
- If the user uses a generic family like "basketball" or "soccer", retrieval expands only within that family.
- If the user does not specify a sport, the app uses the selected UI scope first, then auto-detects from the question, and only broadens when needed.

The retrieval stack is hybrid:

- Structured lookup for exact player facts, rankings, counts, and aggregates
- Vector retrieval for methodology, drill guidance, rule/rubric text, and explanatory content

## UI

The new app will use a lightweight local web UI with:

- a floating chat bubble and slide-up chat panel
- session history
- sport scope selector
- snapshot overview cards
- source and video-aware answers
- quick follow-up actions where useful

The UI should feel close to the existing `Ntanglible_Rag` experience while using SEC-specific black/white dashboard styling and seeded dataset summaries.

## Risks

- The SEC demo mixes officiating, player, and recruiting language in different files.
- Some source keys use different sport ids across different files.
- Some component-level report text is sample marketing copy, not per-player generated truth.

V1 should preserve these records but mark provenance clearly so the chat layer can answer honestly.
