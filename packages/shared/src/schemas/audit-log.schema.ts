import { z } from 'zod';
import { AUDIT_ACTIONS } from '../constants';

export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditLogSchema = z.object({
  id: z.string(),
  actorId: z.string().nullable().optional(),
  actorPhone: z.string().nullable().optional(),
  action: AuditActionSchema,
  entity: z.string().max(50),
  entityId: z.string().max(100),
  before: z.record(z.any()).nullable().optional(),
  after: z.record(z.any()).nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  createdAt: z.date(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const CreateAuditLogSchema = z.object({
  actorId: z.string().optional(),
  actorPhone: z.string().optional(),
  action: AuditActionSchema,
  entity: z.string().max(50),
  entityId: z.string().max(100),
  before: z.record(z.any()).optional(),
  after: z.record(z.any()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});
export type CreateAuditLogInput = z.infer<typeof CreateAuditLogSchema>;

