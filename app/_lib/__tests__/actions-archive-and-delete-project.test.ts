import { getTableName, type Table } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

let sessionUserId = 'owner-user';

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: sessionUserId, tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    activity: { log: vi.fn() },
  },
}));

let membershipRows: Record<string, unknown>[] = [];
let projectRows: Record<string, unknown>[] = [];
const updated: { table: string; values: Record<string, unknown> }[] = [];
const deleted: { table: string }[] = [];

function makeSelectBuilder(rows: unknown[]) {
  const builder = {
    where() {
      return builder;
    },
    limit: async () => rows,
    then(resolve: (rows: unknown[]) => void) {
      resolve(rows);
    },
  };
  return builder;
}

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        if (tableName === 'papertrail_project_members') return makeSelectBuilder(membershipRows);
        if (tableName === 'papertrail_projects') return makeSelectBuilder(projectRows);
        return makeSelectBuilder([]);
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
  updated.length = 0;
  deleted.length = 0;
  membershipRows = [{ role: 'owner' }];
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
});

describe('archiveProject / restoreProject', () => {
  it('sets and clears archivedAt for an owner', async () => {
    const { archiveProject, restoreProject } = await import('../actions');

    await archiveProject('project-1');
    expect(updated[0]).toMatchObject({
      table: 'papertrail_projects',
      values: { archivedAt: expect.any(Number) },
    });

    await restoreProject('project-1');
    expect(updated[1]).toMatchObject({
      table: 'papertrail_projects',
      values: { archivedAt: null },
    });
  });

  it('rejects a non-owner (editor/viewer) with Not authorized', async () => {
    membershipRows = [{ role: 'editor' }];
    const { archiveProject } = await import('../actions');

    await expect(archiveProject('project-1')).rejects.toThrow('Not authorized');
    expect(updated).toHaveLength(0);
  });
});

describe('hardDeleteProject', () => {
  it('deletes membership and project rows, logs activity, and redirects to the index', async () => {
    const { hardDeleteProject } = await import('../actions');

    await hardDeleteProject('project-1');

    expect(deleted.map((d) => d.table)).toEqual([
      'papertrail_boards',
      'papertrail_project_members',
      'papertrail_projects',
    ]);
    expect(redirect).toHaveBeenCalledWith('/papertrail');
  });

  it('rejects a non-owner without deleting anything', async () => {
    membershipRows = [{ role: 'viewer' }];
    const { hardDeleteProject } = await import('../actions');

    await expect(hardDeleteProject('project-1')).rejects.toThrow('Not authorized');
    expect(deleted).toHaveLength(0);
  });
});
