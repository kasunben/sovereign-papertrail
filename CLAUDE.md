# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**PaperTrail** — an evidence-mapping canvas plugin for the
[Sovereign](https://github.com/kasunben/sovereignfs) platform: pin evidence
(notes, images, links) to an infinite board and draw labelled connections
between them. Built on React Flow (`@xyflow/react`), it's the reference
implementation for a **canvas-heavy, offline-first** Sovereign plugin.

This is a **standalone repo** (`kasunben/sovereign-papertrail`, `origin`
remote), not part of the `sovereignfs` monorepo. It's checked out locally
under `sovereignfs/sv-papertrail/plugins/sovereign-papertrail.local/` for
development against a live platform instance, and is adapted in place from a
pre-existing legacy plugin (Vite/React SPA + Express API + Prisma —
[kasunben/PaperTrail](https://github.com/kasunben/PaperTrail)).

Requires Sovereign platform ≥ `0.26.4`.

## Source of truth

- **`SPEC.md`** — canonical spec: manifest, access model, data model,
  architecture, directory structure, SDK dependencies, UI, build plan, open
  questions. Read the relevant section before any task; it is authoritative
  over assumptions.
- **`roadmap.md`** — build order and status for `SPEC.md`'s requirements
  (`PTR-*` IDs, stable, never renumbered/reused). Sequences v0.1 → v0.2 → v0.3
  → v1.0 into an ordered step list with dependencies and status. Check this
  first each session to find the next unblocked step.

There is no `docs/epics/` or `CURRENT_TASK.md` layer here (unlike the platform
monorepo) — `roadmap.md`'s table is the full task index and `SPEC.md` is the
detail; that's the whole hierarchy for this repo.

## Working conventions

- **One roadmap step at a time.** Each row in `roadmap.md`'s build-sequence
  table is one unit of work. Steps are sequenced — don't skip ahead of an
  incomplete dependency, except steps explicitly marked `[parallel]`.
- **The developer assigns the next task at session start** — read
  `roadmap.md`, identify the next unblocked `Status: (blank)` step, and confirm
  with the developer rather than assuming.
- Commits end with:
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **When a step is done, update `roadmap.md`'s Status column (✅) in the same
  PR/commit.** Don't duplicate completion history elsewhere.
- Never merge or push automatically — wait for explicit instruction.

## Hard architectural rules

From `SPEC.md`'s Architecture, Access control, and Data model sections —
critical, easy to accidentally violate:

- **Whole-snapshot sync.** A board's `PUT` replaces all nodes/edges in one
  transaction and increments the version — no per-operation patching (that's
  a PTR-19/CRDT concern, explicitly out of scope for v0.1).
- **Optimistic concurrency (PTR-12):** every snapshot save carries the
  last-seen version token; a stale token returns `409`, never a silent
  overwrite.
- **Text-node markup is sanitised server-side on write** (allow-list of
  formatting tags, no scripts/handlers/iframes) and treated as untrusted on
  render — legacy stored HTML verbatim, this is a deliberate v3 hardening.
- **Link-preview SSRF guard:** resolve the target host first and reject
  private/loopback/link-local ranges (RFC 1918/4193, 169.254.0.0/16, `::1`)
  *before* fetching — not just a literal-string block on `localhost`. http(s)
  only, 5s timeout, ~200KB bounded read, never follow redirects to a blocked
  address.
- **Every board-snapshot and asset route handler re-checks project membership
  and role on every request** — the canvas is a client component, so the
  server-side check on each API route is the only real access boundary. A
  `viewer` role must be rejected server-side even though the client also
  hides editing affordances.
- **Last-owner guard:** a project's last remaining `owner` cannot remove
  themselves (transfer ownership or archive the project instead).
- **No native image-processing dependency.** Use `jimp` (pure JS), not
  `sharp` — a plugin can't edit the host's `pnpm-workspace.yaml`
  `allowBuilds`, so a native dependency breaks external installs silently.
  `sharp` stays the documented upgrade path only if `jimp`'s throughput proves
  insufficient (see `SPEC.md` Open Question §2).
- **All `papertrail_*` tables carry `tenant_id`** per the platform's
  multi-tenant hard rule.
- **Private helpers/components live under underscore-prefixed folders**
  (`app/_components/`, `app/_lib/`, `app/_db/`) so the platform's generate
  script doesn't treat them as routes — same convention as
  `sovereign-tasks.local`.
- **SDK-only access to the platform.** Use `sdk.db`, `sdk.storage`,
  `sdk.directory`, `sdk.auth`, etc. — never reach into platform internals
  directly. See `SPEC.md`'s SDK dependencies table for what's stable vs. still
  RFC-gated (`sdk.events`/RFC 0045, `sdk.tools`/RFC 0047, public page routes
  for PTR-20/RFC 0042 — don't start work gated on an unimplemented RFC).

## Design system

Use `@sovereignfs/ui` components and `--sv-*` tokens for all chrome (toolbar,
panels, dialogs, settings, member management) — no hardcoded colours/spacing.
The React Flow canvas stylesheet is the one sanctioned third-party CSS import;
node/edge visuals still reference `--sv-*` tokens so the canvas follows dark
mode and tenant theming. Desktop-first for canvas editing in v0.1; mobile
collapses chrome and is pan/zoom first.

## Tech stack

Next.js (native plugin route, `'use client'` canvas) · TypeScript ·
React Flow (`@xyflow/react`) · Drizzle ORM (Postgres + SQLite schemas) ·
`jimp` (pure-JS image processing) · `@sovereignfs/sdk` / `@sovereignfs/ui` ·
Vitest.

## Commands

```bash
pnpm test              # vitest run (app/_lib/**/__tests__/**/*.test.ts)
pnpm typecheck          # tsc --noEmit
pnpm db:generate:pg     # drizzle-kit generate against drizzle.config.pg.ts
```

There is no root `pnpm dev`/`pnpm lint`/`pnpm format` here — this repo is
developed as a plugin inside a running Sovereign platform checkout (see the
platform monorepo's `pnpm dev`), which supplies the generate script, ESLint,
and Prettier config. Format/lint against the platform monorepo's config when
editing this repo from within it.

## Directory structure

See `SPEC.md`'s Directory structure section for the full annotated tree and
which file maps to which `PTR-*` requirement. Summary:

```
manifest.json / icon.svg / migrations/
app/
  layout.tsx, page.tsx            # shell + projects overview
  [projectId]/                    # boards list, settings, board/[boardId] canvas
  api/                            # boards, assets, preview route handlers
  _db/schema.ts                   # papertrail_* Drizzle tables (+ schema.postgres.ts)
  _components/                    # Canvas, node types, toolbar, edge editor
  _lib/                           # sync, sanitize, assets, preview, actions, project-rules
```

## Status

v0.1 build sequence (`roadmap.md`): scaffold, project CRUD, project
membership/roles, board CRUD (PTR-04), the canvas skeleton (PTR-05), all three
node content types — text (PTR-06), image (PTR-07), link (PTR-08) — edge
styling + the on-canvas edge editor (PTR-09), tags + board-wide search
(PTR-10), and offline-first sync (PTR-11) are done. Optimistic concurrency
(PTR-12 — the client-side conflict-notice/reload-newer-state UI) is next —
check `roadmap.md` for the current position before starting work.

Search (PTR-10) lives in `_lib/search.ts` (pure, unit-tested) +
`Canvas.tsx`/`OverlayToolbar.tsx`: matches a text node's title/body(stripped
of HTML)/tags or a link node's title/description/url; image nodes never
match. Available to every role including viewers, per SPEC.md's access
control ("viewer... pan, zoom, search, open nodes") — don't gate the search
UI behind `canEdit` the way the add-node/mode controls are. "Hide
non-matches" sets `hidden: true` on non-matching nodes **and** on any edge
touching a hidden node — React Flow does not hide edges automatically just
because an endpoint node is hidden (checked directly against
`@xyflow/react`'s source), so that pairing has to stay explicit if the hiding
logic is ever touched.

The canvas is no longer local-only (PTR-11): `Canvas.tsx` loads a board's
nodes/edges from the localStorage cache first (instant paint), then
reconciles against `GET /papertrail/api/boards/:boardId`; every subsequent
node/edge change re-caches immediately and schedules a debounced (~1.2s)
save via `PUT` on the same route, retried on the `online` event or a 5s
interval fallback if it fails (`_lib/sync.ts`'s `useBoardSync`). The PUT
route does a **whole-board replace** (delete-then-insert, not
`db.transaction()` — better-sqlite3 rejects an async transaction callback at
runtime even though it type-checks against the SDK's opaque client type;
confirmed against `sovereign-plainwrite`'s
`actions-sync-transaction.test.ts`, which hit the same issue) and
re-validates/re-sanitises every node server-side via `_lib/snapshot.ts`
(`validateNode`/`validateEdge`) — this is a second enforcement point for
text-node sanitisation and for URL safety (`javascript:`/`data:` URLs are
stripped from image/link node fields) independent of the individual
node-editor server actions, since a client could otherwise PUT a
hand-crafted snapshot that skips those entirely. A node whose version token
doesn't match the board's current version gets a 409 — but PTR-11 only
*enforces* that; it doesn't yet *recover* from it. Today a 409 is just
treated as a failed save (parks as "pending", retries later with the same
stale version, so it'll keep failing until something else changes the
version back). Building the "this board changed elsewhere — reload?" UI on
top of `useBoardSync`'s `conflict` flag is exactly PTR-12's job — don't
rebuild the retry/debounce plumbing when picking that up.

Critical ordering detail in `Canvas.tsx` if the sync effects are ever
touched: `skipNextSaveRef` exists because the save-effect watches
`nodes`/`edges`, but *we* also call `setNodes`/`setEdges` for the initial
mount, the cache hydration, and the network hydration — without an explicit
skip, each of those would itself look like a user edit and trigger an
immediate autosave-of-what-we-just-loaded. The flag is set right before each
of those three writes (plus once more in `handleVersionChange`, since a
successful save bumps `version`, which changes `getSnapshot`'s identity and
would otherwise re-trigger the effect for no reason) and consumed exactly
once by the next save-effect run.

Edges carry style via plain React Flow fields, not a custom edge component:
`edge.label` (text), `edge.type` (curve — `'default'` | `'straight'` |
`'step'` | `'smoothstep'`, the built-in edge type names), `edge.animated`
(bool), and `edge.style` (`{ stroke, strokeWidth, strokeDasharray }`).
`Canvas.tsx`'s `edgeFieldsFromStyle`/`edgeStyleFromEdge` convert between that
and `EdgeEditor.tsx`'s flatter `EdgeStyleContent` shape — extend those two
functions, not a new custom Edge component, if edge styling grows further.
`EdgeEditor.tsx` uses a fixed 6-colour swatch palette rather than a real
colour picker (`packages/ui` doesn't have one yet — see SPEC.md's UI section,
"Colour swatch picker" is flagged there as a likely-future DS primitive, not
built as part of this task).

The canvas is still local-state only — no board snapshot persistence yet
(that's PTR-11/12), though image bytes are genuinely persisted via
`sdk.storage` on upload (only the canvas's layout referencing them isn't saved
yet). `Canvas.tsx` wires pan/zoom/drag/multi-select, the select/connect mode
toggle, and right-click context menus (pane/node/edge) via `ContextMenu.tsx`;
`nodeTypes` is a module-scope object mapping `'text'`/`'image'`/`'link'` to
`TextNode.tsx`/`ImageNode.tsx`/`LinkNode.tsx` — follow that pattern for any
future node type rather than a new switchboard. Two server-only lib functions
have a hard "never import into a client component" rule, each with a thin
`'use server'` wrapper in `actions.ts`/a route handler as the only sanctioned
entry point: `sanitizeTextMarkup` (`sanitize.ts`, `sanitize-html` allow-list,
via `sanitizeTextNodeBody`) and `fetchLinkPreview` (`preview.ts`, SSRF-guarded
OpenGraph scraper — resolves-then-blocks private/loopback/link-local ranges
on every redirect hop, 5s timeout, ~200KB bounded read, via
`GET /papertrail/api/preview?url=`). Image upload/serve are real Next.js
route handlers (not server actions) under `app/api/assets/` —
`POST /papertrail/api/assets` re-encodes via `jimp` (`_lib/assets.ts`) and
writes both size variants to `sdk.storage` under
`projects/<projectId>/assets/<assetId>[-thumb].jpg`;
`GET .../assets/:projectId/:file` re-checks project membership on every
request and serves with `immutable` cache headers. The project-role
access-check helpers (`getRequestContext`/`requireProjectRole`) live in
`_lib/access.ts`, shared between `actions.ts` (server actions) and route
handlers — extend that module, not a per-route copy, when a new route needs
the same check.
