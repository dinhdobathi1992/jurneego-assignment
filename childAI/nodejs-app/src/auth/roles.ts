export type Role = 'learner' | 'parent' | 'teacher' | 'admin' | 'service';

/**
 * Checks whether a given role has at least one of the required roles.
 */
export function hasRole(userRole: string, ...allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole as Role);
}

/**
 * Check if the role is an adult/educator role.
 */
export function isAdult(role: string): boolean {
  return hasRole(role, 'parent', 'teacher', 'admin');
}

/**
 * Check if the role can perform moderation.
 */
export function canModerate(role: string): boolean {
  return hasRole(role, 'teacher', 'admin');
}

/**
 * Check if the role is an admin.
 */
export function isAdmin(role: string): boolean {
  return hasRole(role, 'admin');
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  service: 100,
  admin: 90,
  teacher: 70,
  parent: 60,
  learner: 10,
};

export function roleLevel(role: string): number {
  return ROLE_HIERARCHY[role as Role] ?? 0;
}
