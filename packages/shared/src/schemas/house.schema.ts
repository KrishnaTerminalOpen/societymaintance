import { z } from 'zod';
import { HOUSE_TYPES } from '../constants';

export const HouseTypeSchema = z.enum(HOUSE_TYPES);
export type HouseType = z.infer<typeof HouseTypeSchema>;

export const HouseSchema = z.object({
  id: z.string(),
  block: z.string().min(1, 'Block is required').max(20),
  houseNumber: z.string().min(1, 'House number is required').max(30),
  type: HouseTypeSchema.default('FLAT_2BHK'),
  ownerId: z.string().nullable().optional(),
  deletedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type House = z.infer<typeof HouseSchema>;

export const CreateHouseSchema = z.object({
  block: z.string().min(1, 'Block is required').max(20),
  houseNumber: z.string().min(1, 'House number is required').max(30),
  type: HouseTypeSchema.default('FLAT_2BHK'),
  ownerId: z.string().optional(),
});
export type CreateHouseInput = z.infer<typeof CreateHouseSchema>;

export const UpdateHouseSchema = CreateHouseSchema.partial();
export type UpdateHouseInput = z.infer<typeof UpdateHouseSchema>;

