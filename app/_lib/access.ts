import { sdk } from '@sovereignfs/sdk';
import { and, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { papertrailProjectMembers } from '../_db/schema';
import { assertProjectRole, type ProjectRole } from './project-rules';

// The SDK intentionally returns an opaque dialect-agnostic DB client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<'async', any, any>;

export interface RequestContext {
  db: Db;
  userId: string;
  tenantId: string;
}

/**
 * Shared by server actions (actions.ts) and plugin API route handlers
 * (app/api/**\/route.ts) — both need the same session → db-client → role-check
 * chain, and every board-snapshot/asset route re-checks membership on every
 * request per the platform's access-control hard rule.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const session = await sdk.auth.requireSession();
  const db = (await sdk.db.getClient()) as Db;
  return { db, userId: session.user.id, tenantId: session.user.tenantId };
}

export async function getProjectMembership(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> {
  const rows = await db
    .select({ role: papertrailProjectMembers.role })
    .from(papertrailProjectMembers)
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.projectId, projectId),
        eq(papertrailProjectMembers.userId, userId),
      ),
    )
    .limit(1);
  const role = rows[0]?.role;
  return role && ['owner', 'editor', 'viewer'].includes(role) ? (role as ProjectRole) : null;
}

export async function requireProjectRole(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string,
  requiredRole: ProjectRole,
): Promise<ProjectRole> {
  const role = await getProjectMembership(db, tenantId, projectId, userId);
  assertProjectRole(role, requiredRole);
  return role;
}
