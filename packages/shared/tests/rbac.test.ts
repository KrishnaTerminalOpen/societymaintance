import { describe, it, expect } from 'vitest';
import {
  hasRole,
  isSuperAdmin,
  isAdminOrSuperAdmin,
  canAccessResidentData,
  assertResidentOwnership,
  ForbiddenException,
} from '../src/auth/rbac';
import { UserRole } from '../src/schemas/user.schema';

describe('Role-Based Access Control (RBAC)', () => {
  const residentUser = { id: 'usr-resident-1', role: 'RESIDENT' as UserRole };
  const adminUser = { id: 'usr-admin-1', role: 'ADMIN' as UserRole };
  const superAdminUser = { id: 'usr-superadmin-1', role: 'SUPER_ADMIN' as UserRole };

  describe('hasRole', () => {
    it('grants access when role is directly in allowed list', () => {
      expect(hasRole('RESIDENT', ['RESIDENT'])).toBe(true);
      expect(hasRole('ADMIN', ['ADMIN'])).toBe(true);
      expect(hasRole('SUPER_ADMIN', ['SUPER_ADMIN'])).toBe(true);
    });

    it('allows super admin to inherit admin permissions', () => {
      expect(hasRole('SUPER_ADMIN', ['ADMIN'])).toBe(true);
    });

    it('denies resident from accessing admin routes', () => {
      expect(hasRole('RESIDENT', ['ADMIN'])).toBe(false);
      expect(hasRole('RESIDENT', ['SUPER_ADMIN'])).toBe(false);
    });
  });

  describe('isSuperAdmin and isAdminOrSuperAdmin', () => {
    it('correctly identifies super admin', () => {
      expect(isSuperAdmin('SUPER_ADMIN')).toBe(true);
      expect(isSuperAdmin('ADMIN')).toBe(false);
      expect(isSuperAdmin('RESIDENT')).toBe(false);
    });

    it('correctly identifies committee admins and super admins', () => {
      expect(isAdminOrSuperAdmin('ADMIN')).toBe(true);
      expect(isAdminOrSuperAdmin('SUPER_ADMIN')).toBe(true);
      expect(isAdminOrSuperAdmin('RESIDENT')).toBe(false);
    });
  });

  describe('canAccessResidentData & assertResidentOwnership', () => {
    it('allows a resident to access their own data', () => {
      expect(canAccessResidentData(residentUser, 'usr-resident-1')).toBe(true);
      expect(() => assertResidentOwnership(residentUser, 'usr-resident-1')).not.toThrow();
    });

    it('STRICTLY DENIES a resident from accessing another resident data', () => {
      const otherResidentId = 'usr-resident-2';
      expect(canAccessResidentData(residentUser, otherResidentId)).toBe(false);
      expect(() => assertResidentOwnership(residentUser, otherResidentId)).toThrow(
        ForbiddenException,
      );
    });

    it('allows Admin and Super Admin to access any resident data', () => {
      const anyResidentId = 'usr-resident-99';
      expect(canAccessResidentData(adminUser, anyResidentId)).toBe(true);
      expect(canAccessResidentData(superAdminUser, anyResidentId)).toBe(true);

      expect(() => assertResidentOwnership(adminUser, anyResidentId)).not.toThrow();
      expect(() => assertResidentOwnership(superAdminUser, anyResidentId)).not.toThrow();
    });
  });
});

