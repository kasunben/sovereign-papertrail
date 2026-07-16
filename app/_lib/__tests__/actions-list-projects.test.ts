import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: 'user-1', tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    activity: { log: vi.fn() },
  },
}));

let membershipRows: Record<string, unknown>[] = [];
let projectRows: Record<string, unknown>[] = [];

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        const builder = {
          where() {
            return builder;
          },
          then(resolve: (rows: unknown[]) => void) {
            if (tableName === 'papertrail_project_members') return resolve(membershipRows);
            if (tableName === 'papertrail_projects') return resolve(projectRows);
            resolve([]);
          },
        };
        return builder;
      },
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  membershipRows = [
    { projectId: 'project-1', role: 'owner' },
    { projectId: 'project-2', role: 'viewer' },
  ];
  projectRows = [
    {
      id: 'project-1',
      tenantId: 'tenant-1',
      name: 'Investigation wall',
      description: null,
      archivedAt: null,
      createdAt: 100,
      updatedAt: 200,
    },
    {
      id: 'project-2',
      tenantId: 'tenant-1',
      name: 'Research map',
      description: null,
      archivedAt: null,
      createdAt: 100,
      updatedAt: 150,
    },
  ];
});

describe('listProjects', () => {
  it('returns only projects the user is a member of, decorated with their role, newest-updated first', async () => {
    const { listProjects } = await import('../actions');

    const result = await listProjects();

    expect(result.map((p) => p.id)).toEqual(['project-1', 'project-2']);
    expect(result[0]).toMatchObject({ id: 'project-1', currentUserRole: 'owner' });
    expect(result[1]).toMatchObject({ id: 'project-2', currentUserRole: 'viewer' });
  });

  it('returns an empty list when the user has no memberships', async () => {
    membershipRows = [];
    const { listProjects } = await import('../actions');

    const result = await listProjects();

    expect(result).toEqual([]);
  });
});
