import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const requireSession = vi.fn(async () => ({ user: { id: 'user-1', tenantId: 'tenant-1' } }));

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession },
    db: { getClient: vi.fn() },
    activity: { log: vi.fn() },
  },
}));

describe('sanitizeTextNodeBody', () => {
  it('requires an authenticated session and returns sanitised markup', async () => {
    const { sanitizeTextNodeBody } = await import('../actions');

    const result = await sanitizeTextNodeBody('<p>hi</p><script>alert(1)</script>');

    expect(requireSession).toHaveBeenCalled();
    expect(result).toBe('<p>hi</p>');
  });
});
