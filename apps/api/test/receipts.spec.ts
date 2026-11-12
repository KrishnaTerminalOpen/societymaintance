import { describe, it, expect, beforeEach } from 'vitest';
import { ReceiptGeneratorService } from '../src/receipts/receipt-generator.service';

describe('ReceiptGeneratorService (PDF & Currency)', () => {
  let generator: ReceiptGeneratorService;

  beforeEach(() => {
    generator = new ReceiptGeneratorService();
  });

  describe('Indian Numbering Words Converter', () => {
    it('converts small amounts correctly', () => {
      expect(generator.numberToIndianWords(100000n)).toBe('One Thousand Rupees Only');
      expect(generator.numberToIndianWords(500000n)).toBe('Five Thousand Rupees Only');
    });

    it('converts lakhs correctly', () => {
      expect(generator.numberToIndianWords(2500000n)).toBe('Twenty Five Thousand Rupees Only');
      expect(generator.numberToIndianWords(10000000n)).toBe('One Lakh Rupees Only');
      expect(generator.numberToIndianWords(15000000n)).toBe('One Lakh Fifty Thousand Rupees Only');
    });

    it('converts zero and edge cases', () => {
      expect(generator.numberToIndianWords(0n)).toBe('Zero Rupees Only');
    });
  });

  describe('generateReceiptPdf', () => {
    it('generates a valid non-empty PDF buffer with metadata', async () => {
      const buffer = await generator.generateReceiptPdf({
        colonyName: 'Gokuldham Co-operative Housing Society',
        colonyAddress: 'Powai, Mumbai - 400076',
        colonyRegistrationNo: 'BOM/HSG/12345/2010',
        receiptNumber: 'REC-202611-10042',
        paymentDate: new Date(),
        residentName: 'Aatmaram Tukaram Bhide',
        residentPhone: '+919800000002',
        residentEmail: 'bhide@gokuldham.in',
        houseBlock: 'A',
        houseNumber: '101',
        houseType: 'FLAT_2BHK',
        amountPaise: 2500000n, // ₹25,000
        paymentMethod: 'UPI',
        gatewayOrderId: 'order_test_998877',
        gatewayPaymentId: 'pay_test_112233',
        status: 'SUCCESS',
        isOffline: false,
      });

      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000); // Valid PDF header & stream
      // PDF magic number check (%PDF-)
      const pdfHeader = buffer.slice(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });
  });
});
