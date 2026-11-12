import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '../constants';

export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatusSchema>;

// Indian phone number regex: accepts "+919876543210" or "9876543210"
export const IndianPhoneRegex = /^(\+91[\-\s]?)?[6789]\d{9}$/;

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string().regex(IndianPhoneRegex, 'Must be a valid Indian phone number (+91XXXXXXXXXX)'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').nullable().optional(),
  role: UserRoleSchema.default('RESIDENT'),
  status: UserStatusSchema.default('ACTIVE'),
  deletedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = z.object({
  phone: z.string().regex(IndianPhoneRegex, 'Must be a valid Indian phone number (+91XXXXXXXXXX)'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').optional(),
  role: UserRoleSchema.default('RESIDENT'),
  status: UserStatusSchema.default('ACTIVE'),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = CreateUserSchema.partial();
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const RequestOtpSchema = z.object({
  phone: z.string().regex(IndianPhoneRegex, 'Must be a valid Indian phone number (+91XXXXXXXXXX)'),
});
export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;

export const VerifyOtpSchema = z.object({
  phone: z.string().regex(IndianPhoneRegex, 'Must be a valid Indian phone number'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

