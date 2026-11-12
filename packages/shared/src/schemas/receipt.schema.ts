import { z } from 'zod';

export const ReceiptSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  receiptNumber: z.string(),
  pdfUrl: z.string().url(),
  generatedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

