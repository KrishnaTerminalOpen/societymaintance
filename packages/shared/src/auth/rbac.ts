import { UserRole } from '../schemas/user.schema';

export const ROLE_LEVELS: Record<UserRole, number> = {
  RESIDENT: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Checks whether user has one of the required roles or a higher role in the hierarchy.
 */
export function hasRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  if (allowedRoles.includes(userRole)) {
    return true;
  }
  // Super admin inherits all admin privileges
  if (userRole === 'SUPER_ADMIN' && allowedRoles.includes('ADMIN')) {
    return true;
  }
  return false;
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === 'SUPER_ADMIN';
}

export function isAdminOrSuperAdmin(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/**
 * Residents can only access their own records.
 * Committee Admins & Super Admins can access records across all residents.
 */
export function canAccessResidentData(
  authUser: { id?: string; sub?: string; role: UserRole },
  targetResidentId: string,
): boolean {
  if (isAdminOrSuperAdmin(authUser.role)) {
    return true;
  }
  const userId = authUser.id || authUser.sub;
  return userId === targetResidentId;
}

export class ForbiddenException extends Error {
  statusCode = 403;
  constructor(message = 'Access Denied: You do not have permission to access this resource') {
    super(message);
    this.name = 'ForbiddenException';
  }
}

export class UnauthorizedException extends Error {
  statusCode = 401;
  constructor(message = 'Unauthorized: Authentication required') {
    super(message);
    this.name = 'UnauthorizedException';
  }
}

export function assertResidentOwnership(
  authUser: { id?: string; sub?: string; role: UserRole },
  targetResidentId: string,
): void {
  if (!canAccessResidentData(authUser, targetResidentId)) {
    throw new ForbiddenException(
      'Resident Isolation Violation: You are not authorized to view or modify another resident\'s data.',
    );
  }
}
