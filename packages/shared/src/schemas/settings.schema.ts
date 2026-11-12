import { z } from 'zod';
import { PAYMENT_METHODS } from '../constants';

export const DepositRulesSchema = z.object({
  standardDepositPaise: z.record(z.number().int().nonnegative()).optional(),
  maxInstallmentsAllowed: z.number().int().positive().default(2),
  refundablePercentage: z.number().min(0).max(100).default(100),
  moveOutNoticeDays: z.number().int().nonnegative().default(30),
});
export type DepositRules = z.infer<typeof DepositRulesSchema>;

export const LateFeeRulesSchema = z.object({
  gracePeriodDays: z.number().int().nonnegative().default(10),
  fixedLateFeePaise: z.number().int().nonnegative().default(50000), // in paise (e.g. ₹500 = 50000)
  dailyInterestPercentage: z.number().nonnegative().default(0),
});
export type LateFeeRules = z.infer<typeof LateFeeRulesSchema>;

export const ColonySettingsSchema = z.object({
  id: z.string().default('default'),
  colonyName: z.string().min(2).max(150),
  logoUrl: z.string().url().nullable().optional(),
  address: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  depositRules: DepositRulesSchema,
  lateFeeRules: LateFeeRulesSchema,
  enabledPaymentMethods: z.array(z.enum(PAYMENT_METHODS)),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ColonySettings = z.infer<typeof ColonySettingsSchema>;

export const UpdateColonySettingsSchema = ColonySettingsSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type UpdateColonySettingsInput = z.infer<typeof UpdateColonySettingsSchema>;

