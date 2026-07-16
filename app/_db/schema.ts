import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Plugin schema — PaperTrail.
 *
 * Conventions (match platform schema):
 * - IDs: ULIDs stored as text (client-generated for nodes/edges — React Flow
 *   mints them — server-generated for projects/boards).
 * - Timestamps: Unix epoch seconds stored as integer.
 * - tenant_id on every user-scoped table.
 * - All tables prefixed papertrail_.
 * - JSON payloads (node data/position, edge data) stored as text — Drizzle's
 *   sqlite-core has no native JSON column type; callers JSON.stringify/parse.
 *
 * v0.1 ships projects, project membership (owner/editor/viewer), boards, and
 * the node/edge snapshot tables (SPEC.md Data model).
 */

export const papertrailProjects = sqliteTable('papertrail_projects', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  createdBy: text('created_by').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  /** Nullable. Soft-archive (PTR-02) — hidden from the default listing, not deleted. */
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Composite PK: (project_id, user_id). The owner row is inserted
 * automatically on project creation (invited_by null for the creator).
 */
export const papertrailProjectMembers = sqliteTable(
  'papertrail_project_members',
  {
    projectId: text('project_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    /** 'owner' | 'editor' | 'viewer' (PTR-03). */
    role: text('role').notNull(),
    /** Nullable. Null for the original project creator. */
    invitedBy: text('invited_by'),
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index('papertrail_project_members_project_idx').on(t.projectId),
  ],
);

export const papertrailBoards = sqliteTable(
  'papertrail_boards',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    title: text('title').notNull(),
    /** Incremented on every snapshot save; part of the version token (PTR-12). */
    version: integer('version').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('papertrail_boards_project_idx').on(t.projectId)],
);

export const papertrailNodes = sqliteTable(
  'papertrail_nodes',
  {
    /** Client-generated (React Flow node id). */
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    boardId: text('board_id').notNull(),
    /** 'text' | 'image' | 'link'. */
    type: text('type').notNull(),
    /** JSON string: type-specific payload (title/text/tags, asset URLs + dimensions, link URL + preview fields). */
    data: text('data').notNull(),
    /** JSON string: { x, y } canvas coordinates. */
    position: text('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('papertrail_nodes_board_idx').on(t.boardId)],
);

export const papertrailEdges = sqliteTable(
  'papertrail_edges',
  {
    /** Client-generated (React Flow edge id). */
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    boardId: text('board_id').notNull(),
    source: text('source').notNull(),
    target: text('target').notNull(),
    /** Nullable JSON string: label, colour, width, line style, curve type, animated flag. */
    data: text('data'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('papertrail_edges_board_idx').on(t.boardId)],
);
