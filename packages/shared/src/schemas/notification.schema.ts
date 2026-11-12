import { z } from 'zod';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
} from '../constants';

export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationStatusSchema = z.enum(NOTIFICATION_STATUSES);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().max(200),
  message: z.string(),
  type: NotificationTypeSchema.default('PAYMENT_DUE'),
  channel: NotificationChannelSchema.default('SMS'),
  status: NotificationStatusSchema.default('PENDING'),
  readAt: z.date().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const CreateNotificationSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  message: z.string().min(1),
  type: NotificationTypeSchema.default('PAYMENT_DUE'),
  channel: NotificationChannelSchema.default('SMS'),
  metadata: z.record(z.any()).optional(),
});
export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;

