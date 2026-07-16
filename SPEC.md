# PaperTrail

**Version:** 0.5\
**Date:** July 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Sovereign PaperTrail plugin — the single source of truth for its manifest, access model, data model, build plan, and its adaptation from the legacy Sovereign architecture.\
**Status:** Draft

---

PaperTrail is an evidence-mapping canvas — _map your evidence, follow the
story_. Users pin evidence (notes, images, links) to an infinite board and draw
labelled connections between them: investigation walls, research maps, story
plotting, dependency untangling. The canvas is built on React Flow
(`@xyflow/react`).

PaperTrail already exists as a working plugin for the **legacy Sovereign
architecture** ([kasunben/PaperTrail](https://github.com/kasunben/PaperTrail)):
a Vite/React SPA with an Express API router, Prisma schema extension, and the
old `plugin.json` capability model. This spec defines its adaptation to the v3
architecture — same product, rebuilt on the native plugin model. The legacy
repo is adapted in place; it is the plugin's home going forward.

The plugin is `type: sovereign` and the reference implementation for a
**canvas-heavy, offline-first** plugin: a large client component, plugin-owned
API route handlers, debounced sync with optimistic concurrency, and server-side
asset processing.

## Current platform refresh (June 2026)

The current platform changes several early assumptions:

- `sdk.db` is implemented; no direct `packages/db` development path is needed.
- Project member selection should use the user-directory SDK (`sdk.directory`,
  RFC 0041 — implemented, stable).
- Images/assets should use plugin storage (`sdk.storage`, RFC 0044 —
  implemented, stable) from the start; no interim direct writes under `data/`
  are needed.
- Public read-only boards should use public plugin page routes (RFC 0042 —
  not yet implemented; PTR-20 is gated on it).
- Live presence/collaboration should use plugin events (RFC 0045 — not yet
  implemented; PTR-19 is gated on it).
- PaperTrail should expose read-only board/project contracts for approved
  consumers and use tool contracts (RFC 0047 — not yet implemented) for
  future assistant-created boards/nodes.
- PaperTrail should participate in user data export/import and deletion.

## Contents

- [Identity and manifest](#identity-and-manifest)
- [Adaptation from the legacy architecture](#adaptation-from-the-legacy-architecture)
- [Access control](#access-control)
- [Functional requirements](#functional-requirements)
- [Architecture: client canvas + snapshot sync](#architecture-client-canvas--snapshot-sync)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [SDK dependencies](#sdk-dependencies)
- [UI](#ui)
- [Build plan](#build-plan)
- [Open questions](#open-questions)
- [Changelog](#changelog)

---

## Identity and manifest

| Property                           | Value                                    |
| ---------------------------------- | ---------------------------------------- |
| `id`                               | `io.openfs.papertrail`         |
| `name`                             | `PaperTrail`                             |
| `type`                             | `sovereign`                              |
| `runtime`                          | `native`                                 |
| `routePrefix`                      | `/papertrail`                            |
| `shell`                            | `default`                                |
| `adminOnly`                        | omitted (`false`)                        |
| `icon`                             | `icon.svg`                               |
| `permissions`                      | `auth:session`, `db:readWrite`, `data:provide`, `activity:write` |
| `repository`                       | `https://github.com/kasunben/sovereign-papertrail` |
| `compatibility.minPlatformVersion` | `0.26.4`                                 |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "io.openfs.papertrail",
  "name": "PaperTrail",
  "version": "0.1.0",
  "description": "Evidence-mapping canvas — map your evidence, follow the story.",
  "type": "sovereign",
  "runtime": "native",
  "routePrefix": "/papertrail",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite", "data:provide", "activity:write"],
  "repository": "https://github.com/kasunben/sovereign-papertrail",
  "compatibility": {
    "minPlatformVersion": "0.26.4"
  }
}
```

---

## Adaptation from the legacy architecture

The legacy plugin targets the old platform (`plugin.json` `compat.platform: ^0.7.3`).
Every legacy concept has a v3 home:

| Legacy (kasunben/PaperTrail today)                                                    | v3 Sovereign                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin.json` — `namespace`, `entryPoints` (web/api), `ui.palette`, dev-server origin | `manifest.json` (schema v1) — `routePrefix`, `shell`, `icon`; theming comes from `--sv-*` tokens, not a palette field                                       |
| Vite/React SPA mounted at `#plugin-root`                                              | Native Next.js route segment; the canvas is a `'use client'` component, composed by the generate script like any plugin page                                |
| Express router exported from `routes/api/index.js`                                    | Next.js route handlers inside the plugin's `app/api/` tree, served session-protected under `/papertrail/api/*`                                              |
| Prisma `extension.prisma` models                                                      | Drizzle schema in `app/_db/schema.ts` + plugin migrations. Table names (`papertrail_*`) carry over; `tenant_id` added per the platform hard rule            |
| Platform-owned "project" concept; **one board per project** (`projectId` unique)      | Plugin-owned **projects containing boards** (one project → many boards). Sharing happens at project level                                                   |
| `userCapabilities` registry (`project:admin/editor/contributor/viewer/guest`)         | Data-scoped access inside the plugin: `papertrail_project_members` with roles `owner` / `editor` / `viewer` (contributor/guest dropped — never implemented) |
| `ctx.prisma`, `ctx.dataDir`, `ctx.logger` injection                                   | `sdk.db` for tables; `sdk.storage` for assets (RFC 0044, implemented); standard logging                                                                     |
| Offline-first `sync.js` (localStorage cache, debounced save, version conflict)        | **Kept as-is conceptually** — this logic is framework-agnostic and is the part of the legacy code most worth preserving                                     |
| Tailwind-ish palette values, inline styles                                            | `@sovereignfs/ui` components and `--sv-*` tokens for all chrome; React Flow's own canvas stylesheet is the one sanctioned third-party CSS                   |

**Data migration:** there is no automated legacy→v3 migration (different
platform, different identity model). The bridge is JSON export/import — legacy
boards export to JSON (existing feature) and import into a v3 board (PTR-13).
This is documented in the plugin README at adaptation time.

---

## Access control

PaperTrail is available to authenticated users who can launch installed plugins.
There is no admin-only gate.

Access within the plugin is **project-scoped**:

- A user sees only projects they created or were invited to.
- **Roles:** `owner` (project settings, members, board create/delete, all
  editing), `editor` (create/edit boards, nodes, edges, assets), `viewer`
  (read-only canvas — pan, zoom, search, open nodes; no editing affordances,
  and the board snapshot API rejects writes).
- An owner cannot remove themselves if they are the only owner (transfer
  ownership or archive the project instead).

All board-snapshot and asset route handlers verify project membership (and
role, for writes) on every request — the canvas being a client component makes
the server-side check the only real boundary.

---

## Functional requirements

Requirements are versioned to their milestone. IDs are stable — never renumber
or reuse a PTR-\* id.

### v0.1 — Core (adaptation parity + project layer)

#### Projects and boards

| ID     | Requirement                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PTR-01 | Create a project: name, optional description.                                                                                                                                                    |
| PTR-02 | Edit project settings; archive a project (soft-delete — hidden from the default listing). Hard delete is a separate, confirmation-required action that destroys the project's boards and assets. |
| PTR-03 | Share a project with other Sovereign instance users. Roles: `owner`, `editor`, `viewer`. Owners invite and remove members; the last owner cannot remove themselves.                              |
| PTR-04 | Create, rename, and delete boards within a project. A project holds any number of boards (the legacy one-board-per-project restriction is lifted).                                               |

#### Canvas

| ID     | Requirement                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PTR-05 | Infinite canvas (React Flow): pan, zoom, node drag, multi-select. Two interaction modes — select and connect — plus right-click context menus on nodes, edges, and the canvas.                                                                     |
| PTR-06 | Text nodes: title, formatted text body, and tags. Stored markup is sanitised server-side on write (see Architecture — sanitisation).                                                                                                               |
| PTR-07 | Image nodes: upload an image; the server re-encodes and resizes it (max 1400px long edge) and generates a thumbnail (max 480px). Assets are stored via `sdk.storage` (RFC 0044) and served by a plugin route with immutable cache headers. |
| PTR-08 | Link nodes: a URL plus a fetched preview (title, description, image) scraped server-side from OpenGraph/HTML meta — with SSRF guards: http(s) only, private-address blocking, 5s timeout, bounded read (~200 KB).                                  |
| PTR-09 | Edges: optional label, colour, width, line style (solid/dashed), curve type, and animation — edited via an on-canvas edge editor.                                                                                                                  |
| PTR-10 | Tags on nodes; board-wide search across titles, text, and tags with a live match count and a "hide non-matches" toggle.                                                                                                                            |
| PTR-11 | Offline-first persistence: the board snapshot is cached in `localStorage`, edits autosave on a debounce (~1.2s), failed saves queue and retry on reconnect (`online` event).                                                                       |
| PTR-12 | Optimistic concurrency: every snapshot carries a version token (`updatedAt:version`). A save against a stale token returns 409; the client surfaces a conflict notice and offers to reload the newer server state.                                 |
| PTR-13 | Export a board to JSON and import a board from JSON (also the migration bridge from legacy PaperTrail installs).                                                                                                                                   |
| PTR-14 | Viewers get a read-only canvas: editing affordances hidden client-side, and all write endpoints reject `viewer`-role requests server-side.                                                                                                         |
| PTR-21 | Auto-layout: arrange nodes on a grid, or via a topological left-to-right flow layout (layer-based, cycle-tolerant). Legacy adaptation-parity item — present in legacy `Flow.jsx`, omitted from the original draft of this spec.                    |

---

### v0.2 — Story and structure

| ID     | Requirement                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PTR-15 | Story mode — "follow the story": define an ordered path through selected nodes and play it back as a step-by-step walkthrough with camera transitions. |
| PTR-16 | Frames: visually group related nodes into named regions; frames move their contents.                                                                   |
| PTR-17 | Undo/redo for canvas operations within a session.                                                                                                      |
| PTR-18 | Duplicate a board within a project; create a board from a saved template.                                                                              |

---

### v0.3 — Sharing and presence

| ID     | Requirement                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PTR-19 | Live presence and collaborative editing (cursors, concurrent edits). **Depends on a platform real-time surface — explicitly out of scope for platform v1 (SRS §4.6); lands only after the platform provides one.** |
| PTR-20 | Public read-only share link for a board (unauthenticated). Requires public plugin page routes (RFC 0042).                                                                                                           |

---

## Architecture: client canvas + snapshot sync

```
┌──────────────────────────────────────────────────┐
│  Canvas page ('use client', React Flow)           │
│  nodes/edges state · toolbar · search · modes     │
└──────┬──────────────────────────────┬────────────┘
       │ debounced snapshot save       │ reads
┌──────▼───────────┐         ┌────────▼─────────┐
│ localStorage      │         │ Plugin API routes │   /papertrail/api/*
│ cache (offline)   │         │ (route handlers)  │   session-protected
└───────────────────┘         └────────┬─────────┘
                                       │
                     ┌─────────────────┼──────────────────┐
              ┌──────▼─────┐   ┌───────▼──────┐   ┌───────▼──────┐
              │ Drizzle     │   │ sdk.storage  │   │ Link preview │
              │ papertrail_*│   │ (assets)     │   │ scraper      │
              └─────────────┘   └──────────────┘   └──────────────┘
```

### Snapshot sync (carried over from legacy)

The board persists as a **whole-snapshot** document: `PUT` replaces all nodes
and edges in one transaction and increments the board version. The client:

1. renders instantly from the `localStorage` cache, then reconciles with the
   server snapshot;
2. autosaves on a ~1.2s debounce after edits; failed saves queue and retry on
   the `online` event;
3. sends the last-seen version token with every save — a mismatch returns 409
   and the client shows a conflict notice (PTR-12).

Full-replace is deliberate at this scale (hundreds of nodes, single editor at
a time); per-operation patching and CRDTs are a PTR-19 concern, not v0.1.

### Route handlers

All plugin API routes live under the plugin's own tree and are therefore
session-protected by the platform middleware — no public exposure, no `/api`
namespace dependency:

- `GET/POST/PUT /papertrail/api/boards/:boardId` — snapshot read/create/replace
  (membership checked; role checked on writes).
- `POST /papertrail/api/assets` — image upload: re-encode via `jimp` (pure
  JS, no native build step — see Open Question §2), resize (1400px max),
  thumbnail (480px max), write via `sdk.storage` scoped to the project.
- `GET /papertrail/api/assets/:projectId/:file` — serve an asset via
  `sdk.storage` (membership checked, immutable cache headers).
- `GET /papertrail/api/preview?url=` — OpenGraph scrape with SSRF guards.

### Sanitisation (new requirement vs legacy)

Legacy stored node HTML verbatim — an XSS hazard once boards are shared. v3
sanitises text-node markup **server-side on write** (allow-list of formatting
tags, no scripts/handlers/iframes) and treats it as untrusted on render.

### SSRF hardening (tightened vs legacy)

The legacy preview scraper blocks only literal `localhost`/`127.0.0.1`/`0.0.0.0`.
v3 resolves the target host first and rejects private, loopback, and link-local
ranges (RFC 1918/4193, 169.254.0.0/16, ::1) before fetching, keeps the 5s
timeout and bounded read, and never follows redirects to a blocked address.

---

## Directory structure

Adapted in place in the existing repo — the legacy Vite/Express layout is
replaced by the standard plugin layout (SRS §2.3):

Private helpers and components live inside `app/` under underscore-prefixed
folders (`app/_components/`, `app/_lib/`, `app/_db/`) so the platform's
generate script does not treat them as routes — the same convention as
`sovereign-tasks.local`:

```
PaperTrail/
├── manifest.json
├── icon.svg                              # PaperTrail icon — sidebar middle section + Launcher grid
├── migrations/
├── app/
│   ├── layout.tsx                        # plugin shell — project/board sidebar + content area
│   ├── page.tsx                          # projects overview
│   ├── [projectId]/
│   │   ├── page.tsx                      # boards list (PTR-04)
│   │   ├── settings/
│   │   │   └── page.tsx                  # project settings + members (PTR-02, PTR-03)
│   │   └── board/
│   │       └── [boardId]/
│   │           └── page.tsx              # the canvas (client component)
│   ├── api/
│   │   ├── boards/
│   │   │   └── [boardId]/
│   │   │       └── route.ts              # GET/POST/PUT snapshot (PTR-11, PTR-12)
│   │   ├── assets/
│   │   │   ├── route.ts                  # POST upload (PTR-07)
│   │   │   └── [projectId]/
│   │   │       └── [file]/
│   │   │           └── route.ts          # GET serve (cache headers, traversal guard)
│   │   └── preview/
│   │       └── route.ts                  # GET link preview (PTR-08)
│   ├── _db/
│   │   └── schema.ts                     # all papertrail_* tables (Drizzle)
│   ├── _components/
│   │   ├── Canvas.tsx                    # React Flow wrapper ('use client')
│   │   ├── nodes/
│   │   │   ├── TextNode.tsx
│   │   │   ├── ImageNode.tsx
│   │   │   └── LinkNode.tsx
│   │   ├── OverlayToolbar.tsx            # modes, add-node, search, import/export
│   │   ├── EdgeEditor.tsx                # label/colour/width/style/animated popover
│   │   └── ContextMenu.tsx
│   └── _lib/
│       ├── sync.ts                       # cache + debounced saver + version tokens (ported from legacy sync.js)
│       ├── sanitize.ts                   # text-node markup sanitiser
│       ├── assets.ts                     # jimp resize/thumbnail helpers (pure JS — Open Question §2)
│       └── preview.ts                    # OG scrape + SSRF guards
└── package.json
```

---

## Data model

Five tables, all prefixed `papertrail_`. All carry `tenant_id` per the platform
architectural rule (SRS hard rules). `papertrail_boards/nodes/edges` carry over
from the legacy Prisma schema with `tenant_id` added; the project and member
tables are new (the legacy platform owned the project concept).

### `papertrail_projects`

| Column        | Type       | Notes                            |
| ------------- | ---------- | -------------------------------- |
| `id`          | uuid / pk  |                                  |
| `tenant_id`   | string     |                                  |
| `created_by`  | string     | FK → users.                      |
| `name`        | string     |                                  |
| `description` | string?    | Nullable.                        |
| `archived_at` | timestamp? | Nullable. Soft-archive (PTR-02). |
| `created_at`  | timestamp  |                                  |
| `updated_at`  | timestamp  |                                  |

### `papertrail_project_members`

| Column       | Type                            | Notes                                                        |
| ------------ | ------------------------------- | ------------------------------------------------------------ |
| `project_id` | uuid                            | FK → `papertrail_projects`.                                  |
| `tenant_id`  | string                          |                                                              |
| `user_id`    | string                          | FK → users.                                                  |
| `role`       | `owner` \| `editor` \| `viewer` | Owner row is inserted automatically on project creation.     |
| `invited_by` | string?                         | Nullable. FK → users. Null for the original project creator. |
| `joined_at`  | timestamp                       |                                                              |

Composite PK: (`project_id`, `user_id`).

### `papertrail_boards`

| Column       | Type      | Notes                                                                              |
| ------------ | --------- | ---------------------------------------------------------------------------------- |
| `id`         | uuid / pk |                                                                                    |
| `tenant_id`  | string    |                                                                                    |
| `project_id` | uuid      | FK → `papertrail_projects`. Many boards per project (legacy was 1:1).              |
| `title`      | string    |                                                                                    |
| `version`    | integer   | Default 0. Incremented on every snapshot save; part of the version token (PTR-12). |
| `created_at` | timestamp |                                                                                    |
| `updated_at` | timestamp |                                                                                    |

### `papertrail_nodes`

| Column       | Type      | Notes                                                                                       |
| ------------ | --------- | ------------------------------------------------------------------------------------------- |
| `id`         | uuid / pk | Client-generated (React Flow node id).                                                      |
| `tenant_id`  | string    |                                                                                             |
| `board_id`   | uuid      | FK → `papertrail_boards`, cascade delete. Indexed.                                          |
| `type`       | string    | Enum: `text` \| `image` \| `link`.                                                          |
| `data`       | json      | Type-specific payload: title/text/tags, asset URLs + dimensions, link URL + preview fields. |
| `position`   | json      | `{ x, y }` canvas coordinates.                                                              |
| `created_at` | timestamp |                                                                                             |
| `updated_at` | timestamp |                                                                                             |

### `papertrail_edges`

| Column       | Type      | Notes                                                                                                            |
| ------------ | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`         | uuid / pk | Client-generated (React Flow edge id).                                                                           |
| `tenant_id`  | string    |                                                                                                                  |
| `board_id`   | uuid      | FK → `papertrail_boards`, cascade delete. Indexed.                                                               |
| `source`     | string    | Source node id.                                                                                                  |
| `target`     | string    | Target node id.                                                                                                  |
| `data`       | json?     | Nullable. Label, colour, width, line style, curve type, animated flag (legacy `__edgeMeta` format carried over). |
| `created_at` | timestamp |                                                                                                                  |
| `updated_at` | timestamp |                                                                                                                  |

---

## SDK dependencies

| SDK surface | Used for                                                | Available from |
| ----------- | ------------------------------------------------------- | -------------- |
| `sdk.auth`        | Current user session                              | Stable                     |
| `sdk.directory`   | User lookup for member management                 | Stable (RFC 0041, implemented) |
| `sdk.db`          | Read/write all `papertrail_*` tables              | Stable                     |
| `sdk.storage`     | Image assets and thumbnails                       | Stable (RFC 0044, implemented) |
| `sdk.events`      | Live presence/collaboration                       | RFC 0045 (not yet implemented) |
| `sdk.data`        | Expose read-only project/board summaries          | Experimental                |
| `sdk.activity`    | Platform-visible project/board events             | Experimental                |
| `sdk.portability` | Export/import/delete participation                | Experimental                |
| `sdk.tools`       | Future confirmed assistant-created boards/nodes   | RFC 0047 (not yet implemented) |

PaperTrail requires no `sdk.mailer` in v1.

### Data contracts

Candidate read-only contracts:

| Contract                    | Version | Shape                                      |
| --------------------------- | ------- | ------------------------------------------ |
| `papertrail.projects`       | 1       | Projects visible to the current user.      |
| `papertrail.board-summary`  | 1       | Board metadata, node counts, tags, story paths. |
| `papertrail.search-snippets` | 1      | Searchable text-node/link metadata snippets. |

### Portability and deletion

Export includes projects, boards, snapshots, nodes, edges, tags, story paths,
asset metadata, and assets when storage supports export. Import remaps project,
board, node, edge, and asset IDs. User deletion removes private projects owned
only by that user, transfers or archives shared projects according to remaining
membership, and removes the user's membership/activity metadata where required.

**No native dependency in v0.1** (resolved, see Open Question §2): image
processing uses `jimp`, a pure-JS library with no native bindings and no
`pnpm` build-script/`allowBuilds` requirement — PaperTrail installs cleanly
into any host with no config edit.

---

## UI

PaperTrail consumes `@sovereignfs/ui` (components and `--sv-*` tokens) for all
chrome — toolbar, panels, dialogs, settings, member management. The React Flow
canvas stylesheet is the one sanctioned third-party CSS import; node and edge
visuals reference `--sv-*` tokens so the canvas follows dark mode and tenant
theming.

**Layout:** projects/boards sidebar on the left, canvas filling the content
area. The canvas page collapses chrome on mobile (pan/zoom first; editing is
desktop-first in v0.1).

**Net-new primitives likely needed in `packages/ui`:**

- **Context menu** — positioned menu with sections and danger items. Broadly
  reusable (Tasks bulk actions, Plainwrite file actions).
- **Icon button cluster / floating toolbar** — grouped icon buttons with
  active-state, used for canvas modes. Reusable for any editor-style plugin.
- **Colour swatch picker** — small fixed-palette picker (edge colours) drawing
  from `--sv-*` primitives; overlaps with the Tasks list-colour open question.
- **Tag input** — already proposed by the Plainwrite spec; PaperTrail is the
  second consumer (node tags).

---

## Build plan

Three milestones plus stable, each a separate branch + PR in the
`kasunben/PaperTrail` repo. Requires Sovereign platform ≥ v0.26.4.

### v0.1 — Core (PTR-01–14, PTR-21)

Project and board CRUD with owner/editor/viewer sharing, the React Flow canvas
with text/image/link nodes and styled edges, tags and search, offline-first
snapshot sync with conflict detection, image upload pipeline, link previews
with hardened SSRF guards, server-side sanitisation, JSON export/import,
read-only viewer mode, auto-layout (grid and flow layout).

**Done when:** A user can create a project, invite an editor and a viewer,
build a board of connected text/image/link evidence, lose connectivity and
keep editing, reconnect and sync, hit a version conflict and recover — and the
viewer can explore but not modify anything, client- and server-side. A JSON
file exported from legacy PaperTrail imports cleanly.

### v0.2 — Story and structure (PTR-15–18)

Story mode walkthroughs, frames, undo/redo, board duplication and templates.

**Done when:** An ordered story path plays back with camera transitions; nodes
group into movable frames; mistakes are undoable; a board can be duplicated.

### v0.3 — Sharing and presence (PTR-19–20)

Live presence/collaboration (gated on RFC 0045) and public read-only share
links (gated on RFC 0042).

**Done when:** Two members see each other's cursors and edits live; a board
can be shared read-only with someone who has no Sovereign account.

### v1.0 — Stable

Polish, documentation, plugin developer guide entry. PaperTrail is the
reference implementation for canvas-heavy, offline-first plugins.

---

## Open questions

1. **Asset storage abstraction.** ~~Resolved~~ — RFC 0044 is already
   implemented; v0.1 uses `sdk.storage` directly from the start. No interim
   direct-write path under `data/` is needed.

2. **`sharp` and plugin native dependencies.** ~~Resolved for v0.1~~ — a
   native dependency (`sharp`) would require a host-side
   `pnpm-workspace.yaml` `allowBuilds` edit that a plugin cannot make itself
   and that `scripts/install-plugins.ts` does not currently detect or
   surface to the operator. Since PaperTrail ships as an externally-installed
   plugin (not bundled with the platform), that failure mode is silent and
   affects every operator install, not just this repo's dev tree. **v0.1
   image processing uses `jimp` (pure JS, no native bindings, no build-script
   requirement) instead** — PaperTrail installs cleanly on any host with no
   config edit. Revisit `sharp` (server-side, libvips-backed — faster, wider
   format coverage including AVIF, correct EXIF-orientation handling) only if
   `jimp`'s throughput proves insufficient in practice, e.g. under bulk JSON
   import (PTR-13) of large legacy boards. The general problem this raises —
   `scripts/install-plugins.ts` giving no feedback when a plugin's native
   dependency is silently blocked — remains open and affects any plugin with
   a genuine native dependency, not just PaperTrail; that's a platform-level
   fix (detect + instruct the operator), tracked separately from this
   plugin's own choice to avoid the dependency.

3. **Conflict resolution depth.** PTR-12 surfaces conflicts and offers reload;
   legacy behaviour. Is a merge view (per-node diff) worth building before live
   collaboration (PTR-19) makes whole-snapshot conflicts rarer? Recommendation:
   no — reload-or-overwrite is acceptable until PTR-19.

4. **Text node format.** Legacy stores HTML fragments. Options: (a) keep
   sanitised HTML (maximum import fidelity), (b) convert to Markdown at the
   editor boundary (consistent with Plainwrite, simpler sanitisation).
   Recommendation: (a) for v0.1 with a strict allow-list sanitiser, since legacy
   import fidelity matters; revisit at v0.2.

5. **Board size limits.** Whole-snapshot PUT means payload grows with board
   size. v0.1 should cap nodes per board and request body size (generous
   defaults) and document the limits; per-operation patching is the long-term
   fix (PTR-19 territory).

6. **Mobile editing.** v0.1 treats mobile as read/pan/zoom-first. Decide how
   much editing (node creation, connect mode) must work on touch before v1.0.

---

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                          |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft — adaptation of legacy PaperTrail (Vite/Express/Prisma) to the v3 native plugin model: plugin-owned projects-with-boards, owner/editor/viewer roles, hardened preview/sanitisation, offline-first sync preserved. |
| 0.4     | Jul 2026 | Corrected `minPlatformVersion` (0.19.0/0.10.0 conflict → 0.26.4, matching the current platform version); updated RFC 0041 (`sdk.directory`) and RFC 0044 (`sdk.storage`) from "pending" to "implemented, stable" throughout; moved `components/`/`lib/` under `app/_components`/`app/_lib` (and `db/schema.ts` under `app/_db/schema.ts`) per the platform's private-folder convention; added PTR-21 (auto-layout — grid and topological flow layout) after reviewing the legacy `Flow.jsx`, which implements it but had no corresponding requirement ID. |
| 0.5     | Jul 2026 | Resolved Open Question §2: v0.1 image processing switches from `sharp` (native bindings, requires a host-side `pnpm-workspace.yaml` edit that a plugin cannot make itself and that the install script does not currently surface — a silent failure mode for every external operator install, not just this dev tree) to `jimp` (pure JS, no build-script requirement). `sharp` remains the documented upgrade path if `jimp`'s throughput proves insufficient in practice. |
