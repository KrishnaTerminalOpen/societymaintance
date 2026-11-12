import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@colony/database';
import { formatPaiseToINR } from '@colony/shared/edge';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: receiptIdOrPaymentId } = await params;

    const receipt = await prisma.receipt.findFirst({
      where: {
        OR: [
          { id: receiptIdOrPaymentId },
          { paymentId: receiptIdOrPaymentId },
          { receiptNumber: receiptIdOrPaymentId },
        ],
      },
      include: {
        payment: {
          include: {
            user: true,
            deposit: {
              include: {
                house: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // Resident data isolation check
    if (session.role === 'RESIDENT' && receipt.payment.userId !== session.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const setting = await prisma.setting.findUnique({
      where: { id: 'default' },
    });

    const payment = receipt.payment;
    const user = payment.user;
    const house = payment.deposit.house;
    const colonyName = setting?.colonyName || 'Greenwood Palms Resident Welfare Association';
    const address = setting?.address || 'Outer Ring Road, Bengaluru, Karnataka';

    // Return HTML printable receipt
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${receipt.receiptNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 30px; }
    .receipt-card { max-width: 650px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { border-bottom: 2px dashed #cbd5e1; padding-bottom: 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand h1 { margin: 0; font-size: 20px; font-weight: 800; color: #1e3a8a; }
    .brand p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
    .receipt-num { text-align: right; }
    .receipt-num span { display: block; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .receipt-num strong { font-size: 16px; color: #0f172a; font-family: monospace; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; margin-top: 6px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; font-size: 13px; }
    .details-grid .item label { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
    .details-grid .item value { font-weight: 600; color: #1e293b; }
    .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    .table th { background: #f1f5f9; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; }
    .table td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; }
    .total-row td { font-size: 16px; font-weight: 800; color: #1e3a8a; border-top: 2px solid #e2e8f0; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; }
    .btn-print { background: #2563eb; color: #ffffff; border: none; padding: 10px 20px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer; margin-bottom: 20px; }
    @media print {
      body { background: #fff; padding: 0; }
      .receipt-card { box-shadow: none; border: none; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div style="max-width: 650px; margin: 0 auto;" class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="receipt-card">
    <div class="header">
      <div class="brand">
        <h1>${colonyName}</h1>
        <p>${address}</p>
        <span class="badge">✓ OFFICIAL RECEIPT - SUCCESS</span>
      </div>
      <div class="receipt-num">
        <span>Receipt No</span>
        <strong>${receipt.receiptNumber}</strong>
        <span style="margin-top: 6px;">Date</span>
        <span style="color: #334155; font-weight: 600;">${new Date(receipt.generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      </div>
    </div>

    <div class="details-grid">
      <div class="item">
        <label>Resident Name</label>
        <value>${user.name}</value>
      </div>
      <div class="item">
        <label>Flat / Unit</label>
        <value>Block ${house.block} - Flat ${house.houseNumber} (${house.type.replace('_', ' ')})</value>
      </div>
      <div class="item">
        <label>Mobile Number</label>
        <value>${user.phone}</value>
      </div>
      <div class="item">
        <label>Payment Method</label>
        <value>${payment.method} ${payment.gatewayPaymentId ? '(' + payment.gatewayPaymentId + ')' : ''}</value>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${payment.deposit.title}</strong>
            <div style="font-size: 11px; color: #64748b;">Security Deposit installment payment</div>
          </td>
          <td style="text-align: right; font-weight: 600;">${formatPaiseToINR(payment.amount)}</td>
        </tr>
        <tr class="total-row">
          <td>Total Paid Amount</td>
          <td style="text-align: right;">${formatPaiseToINR(payment.amount)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <p>This is a computer-generated digital receipt and requires no physical signature.</p>
      <p>Transaction ID: ${payment.id} | Generated on ${new Date(receipt.generatedAt).toLocaleString('en-IN')}</p>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error generating receipt slip:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
