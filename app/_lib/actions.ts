'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sdk } from '@sovereignfs/sdk';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import {
  papertrailProjectMembers,
  papertrailProjects,
  type PapertrailProject,
} from '../_db/schema';
import { recordActivity } from './platform-events';
import { assertProjectRole, type ProjectRole } from './project-rules';

// The SDK intentionally returns an opaque dialect-agnostic DB client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = BaseSQLiteDatabase<'async', any, any>;

interface ProjectContext {
  db: Db;
  userId: string;
  tenantId: string;
}

export interface ProjectListItem extends PapertrailProject {
  currentUserRole: ProjectRole;
}

export interface ProjectDetail extends PapertrailProject {
  currentUserRole: ProjectRole;
}

async function getContext(): Promise<ProjectContext> {
  const session = await sdk.auth.requireSession();
  const db = (await sdk.db.getClient()) as Db;
  return { db, userId: session.user.id, tenantId: session.user.tenantId };
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function formString(formData: FormData, key: string, fallback = '') {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : fallback;
}

async function getMembership(
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

async function requireProjectRole(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string,
  requiredRole: ProjectRole,
): Promise<ProjectRole> {
  const role = await getMembership(db, tenantId, projectId, userId);
  assertProjectRole(role, requiredRole);
  return role;
}

async function getProjectRow(
  db: Db,
  tenantId: string,
  projectId: string,
): Promise<PapertrailProject> {
  const rows = await db
    .select()
    .from(papertrailProjects)
    .where(and(eq(papertrailProjects.tenantId, tenantId), eq(papertrailProjects.id, projectId)))
    .limit(1);
  const project = rows[0];
  if (!project) throw new Error('Project not found.');
  return project;
}

function revalidateProject(projectId: string) {
  revalidatePath('/papertrail');
  revalidatePath(`/papertrail/${projectId}`);
  revalidatePath(`/papertrail/${projectId}/settings`);
}

export async function listProjects(
  options: { includeArchived?: boolean } = {},
): Promise<ProjectListItem[]> {
  const { db, userId, tenantId } = await getContext();

  const memberships = await db
    .select()
    .from(papertrailProjectMembers)
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.userId, userId),
      ),
    );
  const roleByProjectId = new Map(memberships.map((m) => [m.projectId, m.role as ProjectRole]));
  const projectIds = memberships.map((m) => m.projectId);
  if (projectIds.length === 0) return [];

  const conditions = [
    eq(papertrailProjects.tenantId, tenantId),
    inArray(papertrailProjects.id, projectIds),
  ];
  if (!options.includeArchived) conditions.push(isNull(papertrailProjects.archivedAt));

  const projects = await db
    .select()
    .from(papertrailProjects)
    .where(and(...conditions));

  return projects
    .map((project) => ({
      ...project,
      currentUserRole: roleByProjectId.get(project.id) ?? 'viewer',
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const { db, userId, tenantId } = await getContext();
  const role = await getMembership(db, tenantId, projectId, userId);
  assertProjectRole(role, 'viewer');
  const project = await getProjectRow(db, tenantId, projectId);
  return { ...project, currentUserRole: role };
}

export async function createProject(formData: FormData) {
  const { db, userId, tenantId } = await getContext();
  const name = formString(formData, 'name');
  if (!name) throw new Error('Project name is required.');

  const id = randomUUID();
  const ts = now();

  await db.insert(papertrailProjects).values({
    id,
    tenantId,
    createdBy: userId,
    name,
    description: formString(formData, 'description') || null,
    archivedAt: null,
    createdAt: ts,
    updatedAt: ts,
  });

  await db.insert(papertrailProjectMembers).values({
    tenantId,
    projectId: id,
    userId,
    role: 'owner',
    invitedBy: null,
    joinedAt: ts,
  });

  await recordActivity({
    action: 'papertrail.project.created',
    targetType: 'project',
    targetId: id,
    summary: `Created project "${name}".`,
  });

  revalidatePath('/papertrail');
  redirect(`/papertrail/${id}/settings`);
}

export async function updateProjectSettings(projectId: string, formData: FormData) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');

  const name = formString(formData, 'name');
  if (!name) throw new Error('Project name is required.');

  await db
    .update(papertrailProjects)
    .set({
      name,
      description: formString(formData, 'description') || null,
      updatedAt: now(),
    })
    .where(and(eq(papertrailProjects.tenantId, tenantId), eq(papertrailProjects.id, projectId)));

  revalidateProject(projectId);
}

export async function archiveProject(projectId: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  const project = await getProjectRow(db, tenantId, projectId);

  await db
    .update(papertrailProjects)
    .set({ archivedAt: now(), updatedAt: now() })
    .where(and(eq(papertrailProjects.tenantId, tenantId), eq(papertrailProjects.id, projectId)));

  await recordActivity({
    action: 'papertrail.project.archived',
    targetType: 'project',
    targetId: projectId,
    summary: `Archived project "${project.name}".`,
  });

  revalidateProject(projectId);
}

export async function restoreProject(projectId: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  const project = await getProjectRow(db, tenantId, projectId);

  await db
    .update(papertrailProjects)
    .set({ archivedAt: null, updatedAt: now() })
    .where(and(eq(papertrailProjects.tenantId, tenantId), eq(papertrailProjects.id, projectId)));

  await recordActivity({
    action: 'papertrail.project.restored',
    targetType: 'project',
    targetId: projectId,
    summary: `Restored project "${project.name}".`,
  });

  revalidateProject(projectId);
}

export async function hardDeleteProject(projectId: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  const project = await getProjectRow(db, tenantId, projectId);

  // Boards/nodes/edges/assets cascade will be added as those tables gain
  // writers (v0.1 steps 4+); nothing to clean up here yet beyond membership.
  await db
    .delete(papertrailProjectMembers)
    .where(eq(papertrailProjectMembers.projectId, projectId));
  await db
    .delete(papertrailProjects)
    .where(and(eq(papertrailProjects.tenantId, tenantId), eq(papertrailProjects.id, projectId)));

  await recordActivity({
    action: 'papertrail.project.deleted',
    targetType: 'project',
    targetId: projectId,
    summary: `Permanently deleted project "${project.name}".`,
  });

  revalidatePath('/papertrail');
  redirect('/papertrail');
}
