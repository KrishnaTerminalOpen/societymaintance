import { z } from 'zod';
import { REFUND_STATUSES } from '../constants';

export const RefundStatusSchema = z.enum(REFUND_STATUSES);
export type RefundStatus = z.infer<typeof RefundStatusSchema>;

export const RefundSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  amount: z.union([z.number().int().positive(), z.bigint()]),
  reason: z.string().min(3).max(255),
  status: RefundStatusSchema.default('PENDING'),
  gatewayRefundId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Refund = z.infer<typeof RefundSchema>;

export const CreateRefundSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
  amount: z.number().int().positive('Refund amount must be positive integer paise'),
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(255),
});
export type CreateRefundInput = z.infer<typeof CreateRefundSchema>;

