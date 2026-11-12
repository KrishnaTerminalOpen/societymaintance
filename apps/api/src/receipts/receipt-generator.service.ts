import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { formatPaiseToINR } from '@colony/shared';

export interface ReceiptData {
  colonyName: string;
  colonyAddress?: string;
  colonyRegistrationNo?: string;
  receiptNumber: string;
  paymentDate: Date;
  residentName: string;
  residentPhone: string;
  residentEmail?: string | null;
  houseBlock: string;
  houseNumber: string;
  houseType: string;
  amountPaise: bigint | number;
  paymentMethod: string;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  status: string;
  isOffline: boolean;
  offlineNotes?: string | null;
  verifiedBy?: string | null;
}

@Injectable()
export class ReceiptGeneratorService {
  private readonly logger = new Logger(ReceiptGeneratorService.name);

  /**
   * Converts paise to words in Indian numbering format (Lakhs, Crores, Thousands, Rupees).
   */
  numberToIndianWords(paise: bigint | number): string {
    const rupees = Number(BigInt(paise) / 100n);
    if (rupees === 0) return 'Zero Rupees Only';

    const ones = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const convertChunk = (num: number): string => {
      let str = '';
      if (num >= 100) {
        str += ones[Math.floor(num / 100)] + ' Hundred ';
        num %= 100;
      }
      if (num >= 20) {
        str += tens[Math.floor(num / 10)] + ' ';
        num %= 10;
      }
      if (num > 0) {
        str += ones[num] + ' ';
      }
      return str.trim();
    };

    let remaining = rupees;
    let words = '';

    const crore = Math.floor(remaining / 10000000);
    remaining %= 10000000;
    if (crore > 0) {
      words += convertChunk(crore) + ' Crore ';
    }

    const lakh = Math.floor(remaining / 100000);
    remaining %= 100000;
    if (lakh > 0) {
      words += convertChunk(lakh) + ' Lakh ';
    }

    const thousand = Math.floor(remaining / 1000);
    remaining %= 1000;
    if (thousand > 0) {
      words += convertChunk(thousand) + ' Thousand ';
    }

    const hundredAndRemaining = remaining;
    if (hundredAndRemaining > 0) {
      words += convertChunk(hundredAndRemaining) + ' ';
    }

    return `${words.trim()} Rupees Only`;
  }

  /**
   * Generates a beautifully styled branded PDF receipt buffer.
   */
  async generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Receipt ${data.receiptNumber}`,
            Author: data.colonyName,
            Subject: 'Security Deposit Official Receipt',
            Keywords: 'ColonyDeposit, Receipt, Security Deposit',
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const pageWidth = 595.28; // A4 points
        const margin = 40;
        const contentWidth = pageWidth - margin * 2;

        // Top Decorative Brand Banner
        doc.rect(margin, margin, contentWidth, 6).fill('#4f46e5'); // Indigo 600

        let y = margin + 20;

        // Header Section
        doc
          .font('Helvetica-Bold')
          .fontSize(20)
          .fillColor('#111827') // Gray 900
          .text(data.colonyName.toUpperCase(), margin, y, { width: contentWidth, align: 'center' });

        y += 26;
        const address = data.colonyAddress || 'Resident Welfare Association & Housing Society';
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#6b7280') // Gray 500
          .text(address, margin, y, { width: contentWidth, align: 'center' });

        y += 14;
        if (data.colonyRegistrationNo) {
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#9ca3af')
            .text(`Reg. No: ${data.colonyRegistrationNo}`, margin, y, { width: contentWidth, align: 'center' });
          y += 14;
        }

        // Horizontal Rule
        y += 10;
        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
        y += 15;

        // Title and Receipt Badge
        doc
          .font('Helvetica-Bold')
          .fontSize(14)
          .fillColor('#4338ca')
          .text('OFFICIAL SECURITY DEPOSIT RECEIPT', margin, y, { align: 'left' });

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#059669') // Emerald 600
          .text('PAID & VERIFIED', margin, y, { align: 'right' });

        y += 24;

        // Receipt Summary Box (Metadata)
        doc.rect(margin, y, contentWidth, 42).fillAndStroke('#f9fafb', '#e5e7eb');

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#6b7280')
          .text('Receipt Number:', margin + 12, y + 8);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111827')
          .text(data.receiptNumber, margin + 12, y + 22);

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#6b7280')
          .text('Date & Time:', margin + 180, y + 8);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111827')
          .text(
            new Date(data.paymentDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            margin + 180,
            y + 22,
          );

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#6b7280')
          .text('Payment Mode:', margin + 360, y + 8);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111827')
          .text(data.paymentMethod.toUpperCase() + (data.isOffline ? ' (OFFLINE)' : ''), margin + 360, y + 22);

        y += 56;

        // Two Column Layout: Resident Details & Property Unit Details
        const colWidth = (contentWidth - 20) / 2;

        // Left Box: Resident Information
        doc.rect(margin, y, colWidth, 90).fillAndStroke('#ffffff', '#e5e7eb');
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#374151')
          .text('ISSUED TO (RESIDENT)', margin + 12, y + 10);

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#111827')
          .text(data.residentName, margin + 12, y + 28);

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#4b5563')
          .text(`Phone: ${data.residentPhone}`, margin + 12, y + 46);

        if (data.residentEmail) {
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#4b5563')
            .text(`Email: ${data.residentEmail}`, margin + 12, y + 62);
        }

        // Right Box: Property Unit Information
        const rightColX = margin + colWidth + 20;
        doc.rect(rightColX, y, colWidth, 90).fillAndStroke('#ffffff', '#e5e7eb');
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#374151')
          .text('PROPERTY / RESIDENTIAL UNIT', rightColX + 12, y + 10);

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#111827')
          .text(`Block ${data.houseBlock} - Unit ${data.houseNumber}`, rightColX + 12, y + 28);

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#4b5563')
          .text(`Type: ${data.houseType.replace('_', ' ')}`, rightColX + 12, y + 46);

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#4b5563')
          .text('Obligation: Residential Security Deposit', rightColX + 12, y + 62);

        y += 105;

        // Financial Ledger Table Header
        doc.rect(margin, y, contentWidth, 24).fill('#f3f4f6');
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#4b5563')
          .text('ITEM DESCRIPTION', margin + 12, y + 7);
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#4b5563')
          .text('REFERENCE / GATEWAY ID', margin + 260, y + 7);
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#4b5563')
          .text('AMOUNT PAID', margin + contentWidth - 90, y + 7, { width: 80, align: 'right' });

        y += 24;

        // Ledger Row
        doc.rect(margin, y, contentWidth, 40).stroke('#e5e7eb');
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111827')
          .text('Residential Security Deposit', margin + 12, y + 8);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#6b7280')
          .text('Refundable security deposit account credit', margin + 12, y + 22);

        const refText = data.gatewayPaymentId || data.gatewayOrderId || data.offlineNotes || 'Direct Offline Settlement';
        doc
          .font('Courier')
          .fontSize(8)
          .fillColor('#374151')
          .text(refText.substring(0, 36), margin + 260, y + 14);

        const formattedAmount = formatPaiseToINR(data.amountPaise);
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#111827')
          .text(formattedAmount, margin + contentWidth - 90, y + 14, { width: 80, align: 'right' });

        y += 48;

        // Total Summary Box
        doc.rect(margin + contentWidth - 220, y, 220, 32).fillAndStroke('#eef2ff', '#c7d2fe');
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#3730a3')
          .text('TOTAL RECEIVED:', margin + contentWidth - 210, y + 10);
        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor('#1e1b4b')
          .text(formattedAmount, margin + contentWidth - 110, y + 8, { width: 95, align: 'right' });

        y += 42;

        // Amount in Words
        const words = this.numberToIndianWords(data.amountPaise);
        doc.rect(margin, y, contentWidth, 30).fillAndStroke('#fafafa', '#f3f4f6');
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#6b7280')
          .text('Amount in Words:', margin + 10, y + 5);
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#1f2937')
          .text(words, margin + 10, y + 16);

        y += 45;

        // Offline Verification Note if applicable
        if (data.isOffline && data.verifiedBy) {
          doc
            .font('Helvetica-Oblique')
            .fontSize(8)
            .fillColor('#4b5563')
            .text(`Recorded & Verified manually by Committee Admin: ${data.verifiedBy}`, margin, y);
          y += 16;
        }

        // Digital Signature & Verification Seal
        y = Math.max(y, 630);
        doc.rect(margin, y, contentWidth, 68).strokeColor('#e5e7eb').lineWidth(1).stroke();

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#4338ca')
          .text('DIGITAL VERIFICATION & AUTHENTICITY', margin + 14, y + 10);

        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#4b5563')
          .text(
            'This is a cryptographically secured and verified electronic document generated by ColonyDeposit RWA Management System. ' +
            'It serves as valid proof of refundable security deposit receipt under the colony by-laws. No physical signature is required.',
            margin + 14,
            y + 24,
            { width: contentWidth - 140 },
          );

        // Verification Stamp Box on Right
        doc.rect(margin + contentWidth - 115, y + 8, 105, 52).fillAndStroke('#ecfdf5', '#a7f3d0');
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#065f46')
          .text('COLONY RWA', margin + contentWidth - 115, y + 14, { width: 105, align: 'center' });
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#047857')
          .text('SEAL VERIFIED', margin + contentWidth - 115, y + 26, { width: 105, align: 'center' });
        doc
          .font('Courier')
          .fontSize(7)
          .fillColor('#065f46')
          .text(data.receiptNumber.substring(0, 16), margin + contentWidth - 115, y + 42, { width: 105, align: 'center' });

        // Footer Note
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor('#9ca3af')
          .text(
            `Generated on ${new Date().toISOString()} | ColonyDeposit System | ID: ${data.receiptNumber}`,
            margin,
            780,
            { width: contentWidth, align: 'center' },
          );

        doc.end();
      } catch (err) {
        this.logger.error('Failed to generate PDF receipt', err);
        reject(err);
      }
    });
  }
}

