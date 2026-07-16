# Roadmap — PaperTrail

Requirement IDs (PTR-\*) are stable — never renumbered or reused. Full
requirement detail lives in the spec (`SPEC.md`). This file sequences those
requirements into a build order and tracks status.

Legacy reference: [kasunben/PaperTrail](https://github.com/kasunben/PaperTrail)
(Vite/React SPA + Express API + Prisma, `plugin.json` v0.2.0) — reviewed in
full (`plugin.json`, `prisma/extension.prisma`, `routes/api/index.js`,
`src/Flow.jsx`, `src/sync.js`) to ground this breakdown in what already works,
not just the spec's description of it.

## v0.1 — Core (adaptation parity + project layer)

**Not blocked.** All SDK surfaces this milestone needs (`sdk.db`,
`sdk.directory` — RFC 0041, `sdk.storage` — RFC 0044) are implemented and
stable on the current platform (`0.26.4`).

Build sequence — each step depends on the previous unless noted `[parallel]`:

| Order | Work                                                                   | PTR ID(s)      | Depends on         | Status |
| ----- | ----------------------------------------------------------------------- | -------------- | ------------------- | ------ |
| 1     | Scaffold: `manifest.json`, directory skeleton, `package.json`, `app/_db/schema.ts` (5 tables), `migrations/` | — (foundation) | —                    | ✅ |
| 2     | Project CRUD (create, edit, archive, hard-delete)                       | PTR-01, PTR-02 | 1                    | |
| 3     | Project membership + roles (owner/editor/viewer), last-owner guard      | PTR-03         | 2, `sdk.directory`   | |
| 4     | Board CRUD within a project                                             | PTR-04         | 2                    | |
| 5     | Canvas skeleton: React Flow wrapper, pan/zoom/drag/multi-select, select + connect modes, right-click context menus | PTR-05 | 4 | |
| 6     | Text nodes + server-side markup sanitisation (allow-list, ported HTML approach) | PTR-06 | 5 | |
| 7     | Image nodes: upload → `jimp` re-encode/resize (1400px) + thumbnail (480px) → `sdk.storage`; serve route with cache headers | PTR-07 | 5 | |
| 8     | Link nodes: OpenGraph scraper hardened past legacy (resolve-then-block private/loopback/link-local ranges, not just literal `localhost`), 5s timeout, bounded read | PTR-08 | 5 | |
| 9     | Edge styling + on-canvas edge editor (label/colour/width/style/curve/animation) `[parallel with 6–8]` | PTR-09 | 5 | |
| 10    | Tags on nodes + board-wide search (live match count, hide-non-matches toggle) | PTR-10 | 6, 7, 8 | |
| 11    | Offline-first sync: port legacy `sync.js` (localStorage cache, ~1.2s debounce, 409-triggered conflict callback, 5s retry timer, `online` event listener) | PTR-11 | 6–10 | |
| 12    | Optimistic concurrency: version token on every snapshot, 409 on stale save, conflict notice + reload-newer-state UI | PTR-12 | 11 | |
| 13    | JSON export/import, incl. the legacy-board import bridge               | PTR-13         | 11, 12               | |
| 14    | Viewer role enforcement: hide editing affordances client-side, reject writes server-side on every route | PTR-14 | 3, 6–9 | |
| 15    | Auto-layout: grid arrange + topological left→right flow layout (cycle-tolerant) | PTR-21 | 6–9 | |

Step 1 (scaffold) is committed but deliberately minimal beyond the schema:
`app/layout.tsx`/`app/page.tsx` are honest placeholders (no sidebar, no data
fetching) — the real project/board UI is steps 2–4's work, not scaffolding.

**Done when** (from `SPEC.md`): a user creates a project, invites an editor
and a viewer, builds a board of connected text/image/link evidence, loses
connectivity and keeps editing, reconnects and syncs, hits a version conflict
and recovers — the viewer can explore but not modify anything, client- and
server-side — and a JSON file exported from legacy PaperTrail imports
cleanly.

### Notes from the legacy review

- **Auto-layout (PTR-21) was missing from the original spec draft entirely.**
  Legacy `Flow.jsx` has both a grid layout and a topological (layer-based,
  cycle-tolerant) left→right flow layout. Added to `SPEC.md` as PTR-21 and
  slotted into v0.1 since the milestone is framed as adaptation parity.
- **Client-side image compression is a legacy behavior not yet decided for v3**:
  legacy does client-side downscale (max 900px, JPEG q0.8) *before* upload, in
  addition to the server-side pipeline (1400px/480px). Worth a build-time
  decision during step 7 — keep it (saves upload bandwidth) or drop it (server
  pipeline alone is sufficient and simpler); not required for parity since the
  server-side guarantee is what matters for correctness.
- **`sharp` native dependency — resolved, not used in v0.1.** Legacy uses it
  server-side, but installing it here would require a host-side
  `pnpm-workspace.yaml` `allowBuilds` edit that a plugin cannot make itself
  and that the install script doesn't currently detect or surface — a silent
  failure for every external operator install, not just this dev tree, since
  PaperTrail ships as an externally-installed plugin rather than bundled with
  the platform. Step 7 uses `jimp` (pure JS, no build-script requirement)
  instead. `sharp` stays the documented upgrade path if `jimp`'s throughput
  proves insufficient in practice (see `SPEC.md` Open Question §2).
- **Legacy has no frames, undo/redo, or story mode** — confirms these are
  genuinely net-new for v0.2, not adaptation work.
- **Legacy's role model (`userCapabilities`) doesn't map to a simple
  owner/editor/viewer**: it had a `guest` role and split "own project" vs.
  "shared project" permissions (e.g. `post.update` vs. `post.update.shared`,
  `post.delete` vs. `post.delete.shared`). `SPEC.md`'s adaptation table already
  documents dropping `contributor`/`guest` as "never implemented" — confirmed
  accurate from reading `plugin.json` directly (contributor/guest keys exist
  in the capability list but the routes never check them; only the standard
  project-role hierarchy is enforced in `routes/api/index.js`).

---

## v0.2 — Story and structure (PTR-15–18)

**Not blocked** — no RFC dependency. All net-new relative to legacy (confirmed
absent from `Flow.jsx`: no frames, no undo/redo, no story mode).

Suggested order, front-loading the change most other work should be built on
top of:

| Order | Work | PTR ID | Rationale |
| ----- | ---- | ------ | --------- |
| 1 | Undo/redo for canvas operations | PTR-17 | Foundational — every mutation added by frames/story mode should already participate in the undo stack rather than being retrofitted later. |
| 2 | Frames: named regions that move their contents | PTR-16 | Independent of story mode; a natural grouping primitive story-path definition can build on. |
| 3 | Story mode: ordered node path + step-by-step playback with camera transitions | PTR-15 | Benefits from frames existing (a story step can target a frame's contents, not just a single node), though not a hard dependency. |
| 4 | Duplicate a board within a project; create from a saved template | PTR-18 | Independent — can slot in anytime, placed last since it's the least architecturally entangled. |

**Done when** (from `SPEC.md`): an ordered story path plays back with camera
transitions; nodes group into movable frames; mistakes are undoable; a board
can be duplicated.

---

## v0.3 — Sharing and presence (PTR-19–20)

**Blocked — do not start.** Both requirements are explicitly gated on
platform RFCs that are not yet implemented:

- PTR-19 (live presence/collaboration) requires plugin events (RFC 0045 —
  not implemented; also out of scope for platform v1 per SRS §4.6).
- PTR-20 (public read-only share link) requires public plugin page routes
  (RFC 0042 — not implemented).

The two requirements are independent of each other — if only one RFC lands
first, that half of v0.3 can start without waiting on the other.

**Done when** (from `SPEC.md`): two members see each other's cursors and
edits live; a board can be shared read-only with someone who has no Sovereign
account.

---

## v1.0 — Stable

Polish, documentation, plugin developer guide entry — PaperTrail is the
reference implementation for canvas-heavy, offline-first plugins. No new
PTR IDs; scoped once v0.1–v0.3 are complete.

---

## Prioritisation summary

1. **Now:** v0.1 in full (PTR-01–14, PTR-21) — nothing blocks it.
2. **Next:** v0.2 in full (PTR-15–18) — nothing blocks it either; could in
   principle run in parallel with the tail of v0.1, but sequencing after
   keeps the canvas's mutation surface stable while undo/redo (v0.2 step 1)
   is being built.
3. **Parked:** v0.3 (PTR-19–20) — cannot start until RFC 0042 and/or RFC 0045
   land on the platform. Revisit this roadmap once either ships.
