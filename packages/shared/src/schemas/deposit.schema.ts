import { z } from 'zod';
import { DEPOSIT_STATUSES } from '../constants';

export const DepositStatusSchema = z.enum(DEPOSIT_STATUSES);
export type DepositStatus = z.infer<typeof DepositStatusSchema>;

export const DepositSchema = z.object({
  id: z.string(),
  houseId: z.string(),
  title: z.string().min(1).max(150),
  // Monetary amounts in integer paise
  amountDue: z.union([z.number().int().positive(), z.bigint()]),
  amountPaid: z.union([z.number().int().nonnegative(), z.bigint()]).default(0),
  status: DepositStatusSchema.default('PENDING'),
  dueDate: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Deposit = z.infer<typeof DepositSchema>;

export const CreateDepositSchema = z.object({
  houseId: z.string().min(1, 'House ID is required'),
  title: z.string().min(1, 'Title is required').max(150).default('Security Deposit'),
  amountDue: z.number().int().positive('Amount due must be positive integer paise'),
  dueDate: z.coerce.date(),
});
export type CreateDepositInput = z.infer<typeof CreateDepositSchema>;

export const UpdateDepositSchema = z.object({
  title: z.string().max(150).optional(),
  amountDue: z.number().int().positive().optional(),
  amountPaid: z.number().int().nonnegative().optional(),
  status: DepositStatusSchema.optional(),
  dueDate: z.coerce.date().optional(),
});
export type UpdateDepositInput = z.infer<typeof UpdateDepositSchema>;

