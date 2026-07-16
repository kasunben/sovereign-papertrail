import { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * Plugin schema — PaperTrail (Postgres dialect, migration-generation only).
 *
 * Not imported by application code — `app/_db/schema.ts` (SQLite-core
 * builders) is the single schema application code queries against,
 * regardless of which dialect actually backs `sdk.db.getClient()` in
 * production. Drizzle's runtime query builder is bound to the client
 * instance's own dialect (`node-postgres` vs `better-sqlite3`), not to the
 * table object's origin, so the SQLite-typed table objects work correctly
 * against a Postgres connection as long as the physical columns use types
 * that serialize identically.
 *
 * This file exists solely to drive `pnpm db:generate:pg` for
 * `migrations/postgres/`; keep it a structural mirror of `schema.ts` and
 * NEVER use native Postgres `boolean` or `bigint` types here — that would
 * create physical columns whose types the SQLite-typed query objects don't
 * know how to serialize/deserialize against, breaking writes at runtime.
 */

export const papertrailProjects = pgTable('papertrail_projects', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  createdBy: text('created_by').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const papertrailProjectMembers = pgTable(
  'papertrail_project_members',
  {
    projectId: text('project_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    invitedBy: text('invited_by'),
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index('papertrail_project_members_project_idx').on(t.projectId),
  ],
);

export const papertrailBoards = pgTable(
  'papertrail_boards',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    title: text('title').notNull(),
    version: integer('version').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('papertrail_boards_project_idx').on(t.projectId)],
);

export const papertrailNodes = pgTable(
  'papertrail_nodes',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    boardId: text('board_id').notNull(),
    type: text('type').notNull(),
    data: text('data').notNull(),
    position: text('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('papertrail_nodes_board_idx').on(t.boardId)],
);

export const papertrailEdges = pgTable(
  'papertrail_edges',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    boardId: text('board_id').notNull(),
    source: text('source').notNull(),
    target: text('target').notNull(),
    data: text('data'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('papertrail_edges_board_idx').on(t.boardId)],
);
