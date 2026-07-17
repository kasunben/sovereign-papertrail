'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sdk } from '@sovereignfs/sdk';
import type { DirectoryUser } from '@sovereignfs/sdk';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  papertrailBoards,
  papertrailProjectMembers,
  papertrailProjects,
  type PapertrailBoard,
  type PapertrailProject,
  type PapertrailProjectMember,
} from '../_db/schema';
import { type Db, getRequestContext, requireProjectRole } from './access';
import { recordActivity } from './platform-events';
import { isProjectRole, type ProjectRole } from './project-rules';
import { sanitizeTextMarkup } from './sanitize';

export interface ProjectListItem extends PapertrailProject {
  currentUserRole: ProjectRole;
}

export interface ProjectMember extends PapertrailProjectMember {
  displayName: string | null;
  email: string | null;
}

export interface ProjectDetail extends PapertrailProject {
  currentUserRole: ProjectRole;
  members: ProjectMember[];
  directoryLookupFailed: boolean;
}

const getContext = getRequestContext;

function now() {
  return Math.floor(Date.now() / 1000);
}

function formString(formData: FormData, key: string, fallback = '') {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : fallback;
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
  const role = await requireProjectRole(db, tenantId, projectId, userId, 'viewer');
  const project = await getProjectRow(db, tenantId, projectId);

  const memberRows = await db
    .select()
    .from(papertrailProjectMembers)
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.projectId, projectId),
      ),
    )
    .orderBy(asc(papertrailProjectMembers.joinedAt));

  let directoryRows: DirectoryUser[] = [];
  let directoryLookupFailed = false;
  try {
    directoryRows = await sdk.directory.resolveUsers({
      ids: memberRows.map((member) => member.userId),
    });
  } catch {
    directoryLookupFailed = true;
  }
  const userById = new Map(directoryRows.map((user) => [user.id, user]));

  return {
    ...project,
    currentUserRole: role,
    directoryLookupFailed,
    members: memberRows.map((member) => ({
      ...member,
      displayName: userById.get(member.userId)?.name ?? null,
      email: userById.get(member.userId)?.email ?? null,
    })),
  };
}

/**
 * Lighter-weight than getProject: skips the member/directory lookup for
 * pages (e.g. the boards list) that only need the project row and the
 * caller's role.
 */
export async function getProjectSummary(
  projectId: string,
): Promise<{ project: PapertrailProject; currentUserRole: ProjectRole }> {
  const { db, userId, tenantId } = await getContext();
  const role = await requireProjectRole(db, tenantId, projectId, userId, 'viewer');
  const project = await getProjectRow(db, tenantId, projectId);
  return { project, currentUserRole: role };
}

/**
 * Backs the member picker's typeahead — search the platform directory by
 * name/email so inviteProjectMember never has to ask a human for a raw
 * internal user id (nobody knows their own id). Viewer role is enough since
 * this only reads display-safe directory fields, not project membership.
 */
export async function searchProjectDirectoryUsers(
  projectId: string,
  query: string,
): Promise<DirectoryUser[]> {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'viewer');
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return sdk.directory.searchUsers({ query: trimmed, limit: 8 });
}

async function countProjectOwners(db: Db, tenantId: string, projectId: string): Promise<number> {
  const owners = await db
    .select({ userId: papertrailProjectMembers.userId })
    .from(papertrailProjectMembers)
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.projectId, projectId),
        eq(papertrailProjectMembers.role, 'owner'),
      ),
    );
  return owners.length;
}

export async function inviteProjectMember(projectId: string, invitedUserId: string, role: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  if (!isProjectRole(role)) throw new Error('Invalid project role.');

  // Resolve against the platform directory before inserting a membership
  // row — otherwise a typo'd/stale ID silently creates a phantom member that
  // never shows up as an active user anywhere (getProject filters display
  // fields through the same resolveUsers call, so it would just render
  // blank forever instead of failing loudly at invite time).
  const [invitedUser] = await sdk.directory.resolveUsers({ ids: [invitedUserId] });
  if (!invitedUser) throw new Error('That user could not be found.');

  const existing = await db
    .select()
    .from(papertrailProjectMembers)
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.projectId, projectId),
        eq(papertrailProjectMembers.userId, invitedUserId),
      ),
    )
    .limit(1);

  if (existing.length) {
    await updateProjectMemberRole(projectId, invitedUserId, role);
    return;
  }

  await db.insert(papertrailProjectMembers).values({
    tenantId,
    projectId,
    userId: invitedUserId,
    role,
    invitedBy: userId,
    joinedAt: now(),
  });

  const project = await getProjectRow(db, tenantId, projectId);
  await recordActivity({
    action: 'papertrail.project.member_invited',
    subjectUserId: invitedUserId,
    targetType: 'project',
    targetId: projectId,
    summary: `Invited a member to "${project.name}" as ${role}.`,
  });

  revalidateProject(projectId);
}

export async function updateProjectMemberRole(projectId: string, memberUserId: string, role: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  if (!isProjectRole(role)) throw new Error('Invalid project role.');

  const rows = await db
    .select()
    .from(papertrailProjectMembers)
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.projectId, projectId),
        eq(papertrailProjectMembers.userId, memberUserId),
      ),
    )
    .limit(1);
  const target = rows[0];
  if (!target) throw new Error('Member not found.');

  if (target.role === 'owner' && role !== 'owner') {
    const ownerCount = await countProjectOwners(db, tenantId, projectId);
    if (ownerCount <= 1) throw new Error('The last owner cannot be demoted.');
  }

  await db
    .update(papertrailProjectMembers)
    .set({ role })
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.projectId, projectId),
        eq(papertrailProjectMembers.userId, memberUserId),
      ),
    );

  revalidateProject(projectId);
}

export async function removeProjectMember(projectId: string, memberUserId: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');

  const members = await db
    .select()
    .from(papertrailProjectMembers)
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.projectId, projectId),
      ),
    );
  const target = members.find((member) => member.userId === memberUserId);
  if (!target) return;
  const ownerCount = members.filter((member) => member.role === 'owner').length;
  if (target.userId === userId && target.role === 'owner' && ownerCount <= 1) {
    throw new Error('The last owner cannot remove themselves.');
  }

  await db
    .delete(papertrailProjectMembers)
    .where(
      and(
        eq(papertrailProjectMembers.tenantId, tenantId),
        eq(papertrailProjectMembers.projectId, projectId),
        eq(papertrailProjectMembers.userId, memberUserId),
      ),
    );

  const project = await getProjectRow(db, tenantId, projectId);
  await recordActivity({
    action: 'papertrail.project.member_removed',
    subjectUserId: memberUserId,
    targetType: 'project',
    targetId: projectId,
    summary:
      memberUserId === userId
        ? `Left project "${project.name}".`
        : `Removed a member from "${project.name}".`,
  });

  revalidateProject(projectId);
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

  // Nodes/edges/assets cascade will be added once those tables gain writers
  // (v0.1 steps 6+); boards are cleaned up here now that they're writable.
  await db.delete(papertrailBoards).where(eq(papertrailBoards.projectId, projectId));
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

async function getBoardRow(
  db: Db,
  tenantId: string,
  projectId: string,
  boardId: string,
): Promise<PapertrailBoard> {
  const rows = await db
    .select()
    .from(papertrailBoards)
    .where(
      and(
        eq(papertrailBoards.tenantId, tenantId),
        eq(papertrailBoards.projectId, projectId),
        eq(papertrailBoards.id, boardId),
      ),
    )
    .limit(1);
  const board = rows[0];
  if (!board) throw new Error('Board not found.');
  return board;
}

export async function getBoard(
  projectId: string,
  boardId: string,
): Promise<{ board: PapertrailBoard; currentUserRole: ProjectRole }> {
  const { db, userId, tenantId } = await getContext();
  const role = await requireProjectRole(db, tenantId, projectId, userId, 'viewer');
  const board = await getBoardRow(db, tenantId, projectId, boardId);
  return { board, currentUserRole: role };
}

export async function listBoards(projectId: string): Promise<PapertrailBoard[]> {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'viewer');

  const boards = await db
    .select()
    .from(papertrailBoards)
    .where(and(eq(papertrailBoards.tenantId, tenantId), eq(papertrailBoards.projectId, projectId)));

  return boards.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createBoard(projectId: string, formData: FormData) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'editor');

  const title = formString(formData, 'title');
  if (!title) throw new Error('Board title is required.');

  const id = randomUUID();
  const ts = now();

  await db.insert(papertrailBoards).values({
    id,
    tenantId,
    projectId,
    title,
    version: 0,
    createdAt: ts,
    updatedAt: ts,
  });

  await recordActivity({
    action: 'papertrail.board.created',
    targetType: 'board',
    targetId: id,
    summary: `Created board "${title}".`,
  });

  revalidatePath(`/papertrail/${projectId}`);
}

export async function renameBoard(projectId: string, boardId: string, formData: FormData) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'editor');

  const title = formString(formData, 'title');
  if (!title) throw new Error('Board title is required.');

  await db
    .update(papertrailBoards)
    .set({ title, updatedAt: now() })
    .where(
      and(
        eq(papertrailBoards.tenantId, tenantId),
        eq(papertrailBoards.projectId, projectId),
        eq(papertrailBoards.id, boardId),
      ),
    );

  await recordActivity({
    action: 'papertrail.board.renamed',
    targetType: 'board',
    targetId: boardId,
    summary: `Renamed board to "${title}".`,
  });

  revalidatePath(`/papertrail/${projectId}`);
}

/**
 * Deletion is reserved to owners, not editors — same bar as
 * hardDeleteProject, since a board carries the nodes/edges/assets pinned to
 * it and there's no undo.
 */
export async function deleteBoard(projectId: string, boardId: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  const board = await getBoardRow(db, tenantId, projectId, boardId);

  // Node/edge/asset cascade will be added once those tables gain writers
  // (v0.1 steps 6+); nothing to clean up here yet beyond the board row.
  await db
    .delete(papertrailBoards)
    .where(
      and(
        eq(papertrailBoards.tenantId, tenantId),
        eq(papertrailBoards.projectId, projectId),
        eq(papertrailBoards.id, boardId),
      ),
    );

  await recordActivity({
    action: 'papertrail.board.deleted',
    targetType: 'board',
    targetId: boardId,
    summary: `Deleted board "${board.title}".`,
  });

  revalidatePath(`/papertrail/${projectId}`);
}

/**
 * The server-side boundary for PTR-06: text-node body markup is untrusted
 * until it passes through this allow-list sanitiser, and this is the only
 * place that's allowed to run — never import sanitizeTextMarkup directly
 * into a client component. No project/board role check: this doesn't touch
 * any board's stored data, it just cleans HTML a signed-in user is about to
 * hold in their own canvas state.
 */
export async function sanitizeTextNodeBody(html: string): Promise<string> {
  await sdk.auth.requireSession();
  return sanitizeTextMarkup(html);
}
