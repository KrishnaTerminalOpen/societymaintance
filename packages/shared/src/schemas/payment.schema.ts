import { z } from 'zod';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '../constants';

export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentSchema = z.object({
  id: z.string(),
  depositId: z.string(),
  userId: z.string(),
  amount: z.union([z.number().int().positive(), z.bigint()]),
  method: PaymentMethodSchema,
  gatewayOrderId: z.string().nullable().optional(),
  gatewayPaymentId: z.string().nullable().optional(),
  gatewaySignature: z.string().nullable().optional(),
  status: PaymentStatusSchema.default('CREATED'),
  idempotencyKey: z.string().min(8),
  isOffline: z.boolean().default(false),
  offlineNotes: z.string().nullable().optional(),
  offlineVerifiedBy: z.string().nullable().optional(),
  offlineVerifiedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Payment = z.infer<typeof PaymentSchema>;

// Input for creating a Razorpay order
export const CreatePaymentOrderSchema = z.object({
  depositId: z.string().min(1, 'Deposit ID is required'),
  amount: z.number().int().positive('Payment amount must be positive integer paise'),
  idempotencyKey: z.string().min(8, 'Idempotency key must be at least 8 characters'),
});
export type CreatePaymentOrderInput = z.infer<typeof CreatePaymentOrderSchema>;

// Input for verifying Razorpay signature
export const VerifyRazorpayPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type VerifyRazorpayPaymentInput = z.infer<typeof VerifyRazorpayPaymentSchema>;

// Input for committee admins recording cash / cheque offline payment
export const RecordOfflinePaymentSchema = z.object({
  depositId: z.string().min(1, 'Deposit ID is required'),
  userId: z.string().min(1, 'Resident User ID is required'),
  amount: z.number().int().positive('Amount must be positive integer paise'),
  method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER']),
  offlineNotes: z.string().min(3, 'Offline notes / cheque number / bank ref required'),
  idempotencyKey: z.string().min(8),
});
export type RecordOfflinePaymentInput = z.infer<typeof RecordOfflinePaymentSchema>;

