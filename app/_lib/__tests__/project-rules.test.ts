import { describe, expect, it } from 'vitest';
import {
  assertProjectRole,
  canEditProject,
  canManageProject,
  formatProjectRole,
  hasProjectRole,
  isProjectRole,
} from '../project-rules';

describe('project-rules', () => {
  it('ranks owner > editor > viewer', () => {
    expect(hasProjectRole('owner', 'viewer')).toBe(true);
    expect(hasProjectRole('owner', 'editor')).toBe(true);
    expect(hasProjectRole('owner', 'owner')).toBe(true);
    expect(hasProjectRole('editor', 'owner')).toBe(false);
    expect(hasProjectRole('viewer', 'editor')).toBe(false);
  });

  it('treats a missing role as unauthorized for any requirement', () => {
    expect(hasProjectRole(null, 'viewer')).toBe(false);
    expect(hasProjectRole(undefined, 'viewer')).toBe(false);
  });

  it('canEditProject / canManageProject reflect editor/owner thresholds', () => {
    expect(canEditProject('viewer')).toBe(false);
    expect(canEditProject('editor')).toBe(true);
    expect(canEditProject('owner')).toBe(true);
    expect(canManageProject('editor')).toBe(false);
    expect(canManageProject('owner')).toBe(true);
  });

  it('assertProjectRole throws for an insufficient role', () => {
    expect(() => assertProjectRole('viewer', 'owner')).toThrow('Not authorized');
    expect(() => assertProjectRole('owner', 'owner')).not.toThrow();
  });

  it('isProjectRole rejects unknown strings', () => {
    expect(isProjectRole('owner')).toBe(true);
    expect(isProjectRole('contributor')).toBe(false);
  });

  it('formatProjectRole produces a human label', () => {
    expect(formatProjectRole('owner')).toBe('Owner');
    expect(formatProjectRole('editor')).toBe('Editor');
    expect(formatProjectRole('viewer')).toBe('Viewer');
  });
});
