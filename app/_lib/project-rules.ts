export const PROJECT_ROLES = ['owner', 'editor', 'viewer'] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

const roleRank: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function isProjectRole(value: string): value is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(value);
}

export function hasProjectRole(
  actualRole: ProjectRole | null | undefined,
  requiredRole: ProjectRole,
): boolean {
  if (!actualRole) return false;
  return roleRank[actualRole] >= roleRank[requiredRole];
}

export function canEditProject(role: ProjectRole | null | undefined) {
  return hasProjectRole(role, 'editor');
}

export function canManageProject(role: ProjectRole | null | undefined) {
  return hasProjectRole(role, 'owner');
}

export function assertProjectRole(
  actualRole: ProjectRole | null | undefined,
  requiredRole: ProjectRole,
): asserts actualRole is ProjectRole {
  if (!hasProjectRole(actualRole, requiredRole)) {
    throw new Error('Not authorized');
  }
}

export function formatProjectRole(role: ProjectRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'editor':
      return 'Editor';
    case 'viewer':
      return 'Viewer';
  }
}
