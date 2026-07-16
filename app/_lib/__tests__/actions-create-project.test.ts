import { getTableName, type Table } from 'drizzle-orm';
import { redirect } from 'next/navigation';
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

const inserted: { table: string; values: Record<string, unknown> }[] = [];

const fakeDb = {
  insert(table: Table) {
    const tableName = getTableName(table);
    return {
      values: async (values: Record<string, unknown>) => {
        inserted.push({ table: tableName, values });
      },
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
});

describe('createProject', () => {
  it('inserts the project and an owner membership row for the creator, then redirects to settings', async () => {
    const { createProject } = await import('../actions');
    const formData = new FormData();
    formData.set('name', 'Investigation wall');
    formData.set('description', 'Tracking the paper trail');

    await createProject(formData);

    const project = inserted.find((row) => row.table === 'papertrail_projects');
    const member = inserted.find((row) => row.table === 'papertrail_project_members');

    expect(project?.values).toMatchObject({
      tenantId: 'tenant-1',
      createdBy: 'user-1',
      name: 'Investigation wall',
      description: 'Tracking the paper trail',
      archivedAt: null,
    });
    expect(member?.values).toMatchObject({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'owner',
      invitedBy: null,
      projectId: project?.values.id,
    });
    expect(redirect).toHaveBeenCalledWith(`/papertrail/${project?.values.id}/settings`);
  });

  it('rejects an empty name without touching the database', async () => {
    const { createProject } = await import('../actions');
    const formData = new FormData();
    formData.set('name', '   ');

    await expect(createProject(formData)).rejects.toThrow('Project name is required.');
    expect(inserted).toHaveLength(0);
  });
});
