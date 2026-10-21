# Portia Charter Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the exact `d5b0d8d` charter and add a private Supabase-backed visual editor with full style and media support.

**Architecture:** The checked-in charter remains the resilient baseline. A small editor layer activates only for an authenticated owner, serializes section HTML and style overrides to Supabase, stores optimized media in Supabase Storage, and listens for public realtime updates.

**Tech Stack:** Static HTML/CSS/JavaScript, Supabase JS v2, Supabase Postgres/RLS/Realtime/Storage, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-21-portia-editor-design.md`

## Global Constraints

- Commit `d5b0d8dc84f3e0fb3cac380a4c8a0f4d088348d1` is the content and visual baseline.
- Do not expose editor UI to anonymous visitors.
- Preserve every incumbent semantic class and avoid arbitrary iframe HTML.
- Images are resized and compressed before upload; media remains responsive.
- Remote data failure falls back to checked-in section HTML.

## Review Focus

- Empty or partial Supabase content must preserve all baseline pages.
- Malicious HTML and unknown iframe providers must be rejected or converted to safe links.
- Repeated undo/redo after multi-selection formatting must restore exact content.
- Large/unsupported media must show a recoverable error without losing edits.
- Two saves or realtime updates must not silently overwrite a newer revision.

---

### Task 1: Restore the canonical charter

**Files:**
- Restore: `index.html`, `script.js`, `styles.css`, `firebase-ranking.js`, `sections/page1.html` through `sections/page8.html`, existing assets
- Modify: `tests/security.test.mjs`

**Interfaces:**
- Produces: checked-in baseline section HTML and complete incumbent CSS class vocabulary.

- [ ] Add assertions for the latest rules and every semantic style family.
- [ ] Verify the assertions fail on the overwritten version.
- [ ] Restore canonical files from `d5b0d8d` without copying `node_modules`.
- [ ] Verify the restored content and styles pass.
- [ ] Commit the restoration separately.

### Task 2: Harden Supabase persistence and revision history

**Files:**
- Modify: `supabase-data.js`, `supabase/migrations/20261021190000_create_charter_editor.sql`
- Create: `supabase/migrations/20261021220000_add_media_and_revisions.sql`
- Test: `tests/security.test.mjs`

**Interfaces:**
- Produces: `PortiaCharter.load()`, `PortiaCharter.save(document, expectedVersion)`, `PortiaCharter.subscribe(callback)`, `PortiaMedia.upload(file)`.

- [ ] Add failing tests for partial-document fallback, revisions, storage policies, and owner-only writes.
- [ ] Add revision/version columns, immutable revision snapshots, a public media bucket, and owner-only storage policies.
- [ ] Update the client adapter to merge remote content over the baseline and reject conflicting versions.
- [ ] Run the security tests and commit.

### Task 3: Build the editor state engine

**Files:**
- Modify: `editor-core.mjs`
- Create: `tests/editor-core.test.mjs`

**Interfaces:**
- Produces: selection registry, bounded history, safe media URL normalization, HTML sanitization, and formatting commands used by the UI.

- [ ] Add failing tests for Ctrl+click multi-selection, history, safe YouTube embeds, unknown URLs, and sanitizer behavior.
- [ ] Implement the minimal state/command engine.
- [ ] Run the focused tests and commit.

### Task 4: Replace the editor surface

**Files:**
- Modify: `content-editor.js`, `content-editor.css`, `editor-boot.js`, `charter-theme.js`, `index.html`
- Test: `tests/editor-core.test.mjs`, `tests/security.test.mjs`

**Interfaces:**
- Consumes: Task 2 persistence and Task 3 commands.
- Produces: authenticated editor panel with Text, Styles, Blocks, and Media tools.

- [ ] Add DOM-contract tests for anonymous hiding, full style registry, Russian controls, and media actions.
- [ ] Implement the owner-only panel, selection affordances, undo/redo, custom color controls, global class editing, and block insertion.
- [ ] Implement image compression/upload and safe video URL/upload flows with progress and errors.
- [ ] Run all automated tests and commit.

### Task 5: Seed, deploy, and verify end to end

**Files:**
- Modify: `README.md` only if operating instructions changed.

**Interfaces:**
- Consumes: final baseline, migrations, and editor.

- [ ] Apply the Supabase migration and seed all eight canonical sections.
- [ ] Verify owner login, save, revision creation, media upload, realtime anonymous refresh, and anonymous write denial.
- [ ] Inspect desktop and mobile renders in one browser pass and fix material UI issues.
- [ ] Run the Impeccable detector on changed UI targets.
- [ ] Run all tests, verify a clean working tree after commit, push `main`, and verify GitHub Pages.
