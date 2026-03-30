# NTangible SEC RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone desktop-local app that freezes the SEC demo into a fixed-seed Neon snapshot and exposes a sport-scoped RAG chat UI with history and video recommendations.

**Architecture:** A lightweight Node/Express app serves a static frontend patterned after the existing `Ntanglible_Rag` chat experience. A seeded snapshot compiler loads SEC demo source files, materializes raw and derived records, stores them in Neon, and creates Voyage-embedded retrieval documents. Chat requests use sport routing first, then structured SQL lookup plus vector retrieval.

**Tech Stack:** Node.js, Express, TypeScript via `tsx`, Neon serverless driver, Voyage embeddings, OpenAI SDK, Vitest.

---

## File Structure

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server.ts`
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `src/lib/db.ts`
- Create: `src/lib/embeddings.ts`
- Create: `src/lib/config.ts`
- Create: `src/lib/llm.ts`
- Create: `src/lib/snapshot/rng.ts`
- Create: `src/lib/snapshot/load-seeded-module.ts`
- Create: `src/lib/snapshot/build-snapshot.ts`
- Create: `src/lib/snapshot/static-extract.ts`
- Create: `src/lib/chat/scope.ts`
- Create: `src/lib/chat/context.ts`
- Create: `src/lib/chat/prompt.ts`
- Create: `src/lib/store/schema.ts`
- Create: `src/lib/store/seed.ts`
- Create: `src/routes/chat.ts`
- Create: `src/routes/history.ts`
- Create: `src/routes/sessions.ts`
- Create: `src/routes/setup.ts`
- Create: `scripts/seed-db.ts`
- Create: `tests/scope.test.ts`
- Create: `tests/snapshot.test.ts`

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create runtime and test config**
- [ ] **Step 2: Install dependencies**
Run: `npm install`
Expected: install completes with lockfile written

### Task 2: Scope Routing With TDD

**Files:**
- Create: `tests/scope.test.ts`
- Create: `src/lib/chat/scope.ts`

- [ ] **Step 1: Write failing tests for sport detection and cross-sport override**
- [ ] **Step 2: Run `npm test -- --run tests/scope.test.ts` and confirm failure**
- [ ] **Step 3: Implement minimal sport routing logic**
- [ ] **Step 4: Re-run `npm test -- --run tests/scope.test.ts` and confirm pass**

### Task 3: Seeded Snapshot Compiler With TDD

**Files:**
- Create: `tests/snapshot.test.ts`
- Create: `src/lib/snapshot/rng.ts`
- Create: `src/lib/snapshot/load-seeded-module.ts`
- Create: `src/lib/snapshot/static-extract.ts`
- Create: `src/lib/snapshot/build-snapshot.ts`

- [ ] **Step 1: Write failing tests for deterministic snapshots**
- [ ] **Step 2: Run `npm test -- --run tests/snapshot.test.ts` and confirm failure**
- [ ] **Step 3: Implement seeded module loading and snapshot assembly**
- [ ] **Step 4: Re-run `npm test -- --run tests/snapshot.test.ts` and confirm pass**

### Task 4: Neon Schema And Seed Pipeline

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/store/schema.ts`
- Create: `src/lib/store/seed.ts`
- Create: `scripts/seed-db.ts`

- [ ] **Step 1: Implement schema SQL for snapshot, people, crew chiefs, drills, documents, and conversations**
- [ ] **Step 2: Implement seed pipeline that writes a fixed-seed snapshot and document embeddings**
- [ ] **Step 3: Add script entrypoints for seeding**

### Task 5: Chat Retrieval And History APIs

**Files:**
- Create: `src/lib/config.ts`
- Create: `src/lib/embeddings.ts`
- Create: `src/lib/llm.ts`
- Create: `src/lib/chat/context.ts`
- Create: `src/lib/chat/prompt.ts`
- Create: `src/routes/chat.ts`
- Create: `src/routes/history.ts`
- Create: `src/routes/sessions.ts`
- Create: `src/routes/setup.ts`
- Create: `server.ts`

- [ ] **Step 1: Implement config and provider helpers**
- [ ] **Step 2: Implement structured context lookup plus vector retrieval**
- [ ] **Step 3: Implement chat, setup, history, and sessions routes**
- [ ] **Step 4: Wire Express server and static hosting**

### Task 6: Frontend Chat UI

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

- [ ] **Step 1: Build dashboard shell and snapshot overview**
- [ ] **Step 2: Build floating chat panel with sport selector, history, and source/video cards**
- [ ] **Step 3: Connect UI to setup and chat APIs**

### Task 7: Verification

**Files:**
- Verify: `tests/scope.test.ts`
- Verify: `tests/snapshot.test.ts`
- Verify: app boot and seed script

- [ ] **Step 1: Run targeted tests**
Run: `npm test -- --run tests/scope.test.ts tests/snapshot.test.ts`
Expected: both test files pass

- [ ] **Step 2: Run full test suite**
Run: `npm test`
Expected: suite passes

- [ ] **Step 3: Seed a snapshot**
Run: `npm run seed`
Expected: schema and snapshot insert complete when env vars are present

- [ ] **Step 4: Start the app**
Run: `npm run dev`
Expected: local server starts and serves the chat UI
