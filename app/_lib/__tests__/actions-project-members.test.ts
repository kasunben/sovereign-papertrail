import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

let sessionUserId = 'owner-user';
let directoryUsers: { id: string; email: string; name: string | null; image: string | null }[] = [];

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: sessionUserId, tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    activity: { log: vi.fn() },
    directory: {
      resolveUsers: vi.fn(async ({ ids }: { ids: string[] }) =>
        directoryUsers.filter((user) => ids.includes(user.id)),
      ),
      searchUsers: vi.fn(async () => directoryUsers),
    },
  },
}));

let membershipRows: Record<string, unknown>[] = [];
let projectRows: Record<string, unknown>[] = [];
const inserted: { table: string; values: Record<string, unknown> }[] = [];
const updated: { table: string; values: Record<string, unknown> }[] = [];
const deleted: { table: string }[] = [];

function snakeToCamel(value: string) {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Extracts { column, value } equality pairs out of a drizzle `and(eq(...), ...)`
 * condition tree by walking `queryChunks` — real drizzle SQL objects, not a
 * stub — so this fake `where()` can actually filter fixture rows instead of
 * always returning the whole table (which previously made every targeted
 * lookup — e.g. "does this specific user already have a membership row" —
 * indistinguishably return every row in the table).
 */
function extractEqualityPairs(node: unknown, pending: { column: string | null }, out: Record<string, unknown>) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const child of node) extractEqualityPairs(child, pending, out);
    return;
  }
  if (typeof node !== 'object') return;
  const record = node as { constructor: { name: string }; name?: string; table?: unknown; value?: unknown; queryChunks?: unknown };
  if (record.constructor?.name === 'Param') {
    if (pending.column) {
      out[pending.column] = record.value;
      pending.column = null;
    }
    return;
  }
  if (typeof record.name === 'string' && record.table && !record.queryChunks) {
    pending.column = record.name;
    return;
  }
  if (record.queryChunks) extractEqualityPairs(record.queryChunks, pending, out);
}

function filterRows(rows: Record<string, unknown>[], condition: unknown) {
  const columnValues: Record<string, unknown> = {};
  extractEqualityPairs(condition, { column: null }, columnValues);
  return rows.filter((row) =>
    Object.entries(columnValues).every(([column, value]) => row[snakeToCamel(column)] === value),
  );
}

function makeSelectBuilder(rowsGetter: () => unknown[]) {
  let matched = rowsGetter();
  const builder = {
    where(condition: unknown) {
      matched = filterRows(rowsGetter() as Record<string, unknown>[], condition);
      return builder;
    },
    orderBy: async () => matched,
    limit: async (n: number) => matched.slice(0, n),
    then(resolve: (rows: unknown[]) => void) {
      resolve(matched);
    },
  };
  return builder;
}

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        if (tableName === 'papertrail_project_members') return makeSelectBuilder(() => membershipRows);
        if (tableName === 'papertrail_projects') return makeSelectBuilder(() => projectRows);
        return makeSelectBuilder(() => []);
      },
    };
  },
  insert(table: Table) {
    const tableName = getTableName(table);
    return {
      values: async (values: Record<string, unknown>) => {
        inserted.push({ table: tableName, values });
        if (tableName === 'papertrail_project_members') membershipRows.push(values);
      },
    };
  },
  update(table: Table) {
    const tableName = getTableName(table);
    return {
      set(values: Record<string, unknown>) {
        return {
          where: async () => {
            updated.push({ table: tableName, values });
          },
        };
      },
    };
  },
  delete(table: Table) {
    const tableName = getTableName(table);
    return {
      where: async () => {
        deleted.push({ table: tableName });
      },
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUserId = 'owner-user';
  inserted.length = 0;
  updated.length = 0;
  deleted.length = 0;
  membershipRows = [
    { projectId: 'project-1', tenantId: 'tenant-1', userId: 'owner-user', role: 'owner' },
  ];
  projectRows = [
    {
      id: 'project-1',
      tenantId: 'tenant-1',
      name: 'Investigation wall',
      description: null,
      archivedAt: null,
      createdAt: 100,
      updatedAt: 100,
    },
  ];
  directoryUsers = [{ id: 'new-user', email: 'new@example.com', name: 'New Person', image: null }];
});

describe('inviteProjectMember', () => {
  it('inserts a membership row for a resolved directory user', async () => {
    const { inviteProjectMember } = await import('../actions');

    await inviteProjectMember('project-1', 'new-user', 'editor');

    const member = inserted.find((row) => row.table === 'papertrail_project_members');
    expect(member?.values).toMatchObject({
      projectId: 'project-1',
      tenantId: 'tenant-1',
      userId: 'new-user',
      role: 'editor',
      invitedBy: 'owner-user',
    });
  });

  it('rejects an unresolvable user id', async () => {
    directoryUsers = [];
    const { inviteProjectMember } = await import('../actions');

    await expect(inviteProjectMember('project-1', 'ghost-user', 'editor')).rejects.toThrow(
      'That user could not be found.',
    );
    expect(inserted).toHaveLength(0);
  });

  it('rejects a non-owner caller', async () => {
    membershipRows = [{ projectId: 'project-1', tenantId: 'tenant-1', userId: 'owner-user', role: 'editor' }];
    const { inviteProjectMember } = await import('../actions');

    await expect(inviteProjectMember('project-1', 'new-user', 'editor')).rejects.toThrow('Not authorized');
  });
});

describe('updateProjectMemberRole', () => {
  it('changes an existing member role', async () => {
    membershipRows.push({ projectId: 'project-1', tenantId: 'tenant-1', userId: 'member-1', role: 'viewer' });
    const { updateProjectMemberRole } = await import('../actions');

    await updateProjectMemberRole('project-1', 'member-1', 'editor');

    expect(updated[0]).toMatchObject({
      table: 'papertrail_project_members',
      values: { role: 'editor' },
    });
  });

  it('refuses to demote the last owner', async () => {
    const { updateProjectMemberRole } = await import('../actions');

    await expect(updateProjectMemberRole('project-1', 'owner-user', 'editor')).rejects.toThrow(
      'The last owner cannot be demoted.',
    );
    expect(updated).toHaveLength(0);
  });

  it('allows demoting an owner when another owner remains', async () => {
    membershipRows.push({ projectId: 'project-1', tenantId: 'tenant-1', userId: 'member-1', role: 'owner' });
    const { updateProjectMemberRole } = await import('../actions');

    await updateProjectMemberRole('project-1', 'member-1', 'editor');

    expect(updated[0]).toMatchObject({ values: { role: 'editor' } });
  });
});

describe('removeProjectMember', () => {
  it('removes a non-owner member', async () => {
    membershipRows.push({ projectId: 'project-1', tenantId: 'tenant-1', userId: 'member-1', role: 'viewer' });
    const { removeProjectMember } = await import('../actions');

    await removeProjectMember('project-1', 'member-1');

    expect(deleted).toEqual([{ table: 'papertrail_project_members' }]);
  });

  it('refuses to let the last owner remove themselves', async () => {
    const { removeProjectMember } = await import('../actions');

    await expect(removeProjectMember('project-1', 'owner-user')).rejects.toThrow(
      'The last owner cannot remove themselves.',
    );
    expect(deleted).toHaveLength(0);
  });

  it('allows the last owner to remove someone else', async () => {
    membershipRows.push({ projectId: 'project-1', tenantId: 'tenant-1', userId: 'member-1', role: 'viewer' });
    const { removeProjectMember } = await import('../actions');

    await removeProjectMember('project-1', 'member-1');

    expect(deleted).toEqual([{ table: 'papertrail_project_members' }]);
  });
});
