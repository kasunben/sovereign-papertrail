import { getTableName, type Table } from 'drizzle-orm';
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
let boardRows: Record<string, unknown>[] = [];
const inserted: { table: string; values: Record<string, unknown> }[] = [];
const updated: { table: string; values: Record<string, unknown> }[] = [];
const deleted: { table: string }[] = [];

function makeSelectBuilder(rowsGetter: () => unknown[]) {
  const builder = {
    where() {
      return builder;
    },
    limit: async () => rowsGetter(),
    then(resolve: (rows: unknown[]) => void) {
      resolve(rowsGetter());
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
        if (tableName === 'papertrail_boards') return makeSelectBuilder(() => boardRows);
        return makeSelectBuilder(() => []);
      },
    };
  },
  insert(table: Table) {
    const tableName = getTableName(table);
    return {
      values: async (values: Record<string, unknown>) => {
        inserted.push({ table: tableName, values });
        if (tableName === 'papertrail_boards') boardRows.push(values);
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

function makeFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUserId = 'owner-user';
  inserted.length = 0;
  updated.length = 0;
  deleted.length = 0;
  membershipRows = [{ role: 'owner' }];
  boardRows = [
    {
      id: 'board-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      title: 'Timeline',
      version: 0,
      createdAt: 100,
      updatedAt: 100,
    },
  ];
});

describe('listBoards', () => {
  it('returns boards for a viewer', async () => {
    membershipRows = [{ role: 'viewer' }];
    const { listBoards } = await import('../actions');

    const boards = await listBoards('project-1');

    expect(boards).toEqual(boardRows);
  });

  it('rejects a caller with no membership', async () => {
    membershipRows = [];
    const { listBoards } = await import('../actions');

    await expect(listBoards('project-1')).rejects.toThrow('Not authorized');
  });
});

describe('createBoard', () => {
  it('inserts a board for an editor', async () => {
    membershipRows = [{ role: 'editor' }];
    const { createBoard } = await import('../actions');

    await createBoard('project-1', makeFormData({ title: 'Suspects' }));

    const board = inserted.find((row) => row.table === 'papertrail_boards');
    expect(board?.values).toMatchObject({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      title: 'Suspects',
      version: 0,
    });
  });

  it('rejects a viewer', async () => {
    membershipRows = [{ role: 'viewer' }];
    const { createBoard } = await import('../actions');

    await expect(createBoard('project-1', makeFormData({ title: 'Suspects' }))).rejects.toThrow(
      'Not authorized',
    );
    expect(inserted).toHaveLength(0);
  });

  it('rejects an empty title without touching the database', async () => {
    membershipRows = [{ role: 'editor' }];
    const { createBoard } = await import('../actions');

    await expect(createBoard('project-1', makeFormData({ title: '  ' }))).rejects.toThrow(
      'Board title is required.',
    );
    expect(inserted).toHaveLength(0);
  });
});

describe('renameBoard', () => {
  it('updates the title for an editor', async () => {
    membershipRows = [{ role: 'editor' }];
    const { renameBoard } = await import('../actions');

    await renameBoard('project-1', 'board-1', makeFormData({ title: 'Renamed' }));

    expect(updated[0]).toMatchObject({
      table: 'papertrail_boards',
      values: { title: 'Renamed' },
    });
  });

  it('rejects a viewer', async () => {
    membershipRows = [{ role: 'viewer' }];
    const { renameBoard } = await import('../actions');

    await expect(renameBoard('project-1', 'board-1', makeFormData({ title: 'Renamed' }))).rejects.toThrow(
      'Not authorized',
    );
    expect(updated).toHaveLength(0);
  });
});

describe('deleteBoard', () => {
  it('deletes the board for an owner', async () => {
    const { deleteBoard } = await import('../actions');

    await deleteBoard('project-1', 'board-1');

    expect(deleted).toEqual([{ table: 'papertrail_boards' }]);
  });

  it('rejects an editor (deletion is owner-only)', async () => {
    membershipRows = [{ role: 'editor' }];
    const { deleteBoard } = await import('../actions');

    await expect(deleteBoard('project-1', 'board-1')).rejects.toThrow('Not authorized');
    expect(deleted).toHaveLength(0);
  });
});
