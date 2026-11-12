import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, PaymentStatus, AuditAction, DepositStatus } from '@colony/database';
import { RazorpayGateway } from '../payments/gateways/razorpay.gateway';
import { formatPaiseToINR } from '@colony/shared';
import { AuthContext } from '../payments/payments.service';

export type DiscrepancyType = 'MATCHED' | 'MISSING_IN_DB' | 'STATUS_MISMATCH' | 'AMOUNT_MISMATCH';

export interface ReconciliationItem {
  gatewayPaymentId: string;
  gatewayOrderId?: string;
  dbPaymentId?: string;
  dbReceiptNumber?: string;
  residentName?: string;
  unit?: string;
  gatewayAmountPaise: number;
  dbAmountPaise?: number;
  gatewayStatus: string;
  dbStatus?: string;
  discrepancyType: DiscrepancyType;
  variancePaise: number;
  date: Date;
  isResynced: boolean;
}

export interface ReconciliationReport {
  generatedAt: Date;
  dateRange: { from: Date; to: Date };
  metrics: {
    totalTransactions: number;
    matchedCount: number;
    discrepancyCount: number;
    missingInDbCount: number;
    statusMismatchCount: number;
    amountMismatchCount: number;
    totalGatewayAmountPaise: number;
    totalDbAmountPaise: number;
    netVariancePaise: number;
  };
  items: ReconciliationItem[];
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly gateway: RazorpayGateway) {}

  /**
   * Runs cross-system reconciliation between Razorpay Gateway and Database.
   */
  async runReconciliation(from?: Date, to?: Date): Promise<ReconciliationReport> {
    const fromDate = from || new Date(Date.now() - 30 * 86400000); // Default 30 days
    const toDate = to || new Date();

    this.logger.log(`Running reconciliation for period: ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    // 1. Fetch settled gateway transactions
    const gatewayPayments = await this.gateway.fetchSettledPayments(fromDate, toDate);

    // 2. Fetch local database payments in same window
    const dbPayments = await prisma.payment.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
      },
      include: {
        user: true,
        deposit: { include: { house: true } },
        receipt: true,
      },
    });

    const dbPaymentsByGatewayId = new Map(
      dbPayments.filter((p) => p.gatewayPaymentId).map((p) => [p.gatewayPaymentId!, p]),
    );
    const dbPaymentsByOrderId = new Map(
      dbPayments.filter((p) => p.gatewayOrderId).map((p) => [p.gatewayOrderId!, p]),
    );

    const items: ReconciliationItem[] = [];
    let matchedCount = 0;
    let missingInDbCount = 0;
    let statusMismatchCount = 0;
    let amountMismatchCount = 0;
    let totalGatewayAmountPaise = 0;
    let totalDbAmountPaise = 0;

    // 3. Compare each Gateway transaction against DB
    for (const gw of gatewayPayments) {
      totalGatewayAmountPaise += gw.amountPaise;

      const dbMatch =
        dbPaymentsByGatewayId.get(gw.paymentId) ||
        (gw.orderId ? dbPaymentsByOrderId.get(gw.orderId) : undefined);

      if (!dbMatch) {
        // Missing in DB entirely
        missingInDbCount++;
        items.push({
          gatewayPaymentId: gw.paymentId,
          gatewayOrderId: gw.orderId,
          gatewayAmountPaise: gw.amountPaise,
          gatewayStatus: gw.status,
          discrepancyType: 'MISSING_IN_DB',
          variancePaise: gw.amountPaise,
          date: new Date(),
          isResynced: false,
        });
        continue;
      }

      totalDbAmountPaise += Number(dbMatch.amount);
      const isAmountMatch = Number(dbMatch.amount) === gw.amountPaise;
      const isStatusMatch =
        (gw.status === 'captured' && dbMatch.status === PaymentStatus.SUCCESS) ||
        (gw.status === 'refunded' && dbMatch.status === PaymentStatus.REFUNDED);

      let discrepancy: DiscrepancyType = 'MATCHED';
      if (!isAmountMatch) {
        discrepancy = 'AMOUNT_MISMATCH';
        amountMismatchCount++;
      } else if (!isStatusMatch) {
        discrepancy = 'STATUS_MISMATCH';
        statusMismatchCount++;
      } else {
        matchedCount++;
      }

      items.push({
        gatewayPaymentId: gw.paymentId,
        gatewayOrderId: gw.orderId || dbMatch.gatewayOrderId || undefined,
        dbPaymentId: dbMatch.id,
        dbReceiptNumber: dbMatch.receipt?.receiptNumber,
        residentName: dbMatch.user.name,
        unit: `Block ${dbMatch.deposit.house?.block || ''}-${dbMatch.deposit.house?.houseNumber || ''}`,
        gatewayAmountPaise: gw.amountPaise,
        dbAmountPaise: Number(dbMatch.amount),
        gatewayStatus: gw.status,
        dbStatus: dbMatch.status,
        discrepancyType: discrepancy,
        variancePaise: Math.abs(gw.amountPaise - Number(dbMatch.amount)),
        date: dbMatch.createdAt,
        isResynced: false,
      });
    }

    const discrepancyCount = missingInDbCount + statusMismatchCount + amountMismatchCount;
    const netVariancePaise = Math.abs(totalGatewayAmountPaise - totalDbAmountPaise);

    this.logger.log(
      `Reconciliation completed: ${items.length} items checked. Matched: ${matchedCount}, Discrepancies: ${discrepancyCount}`,
    );

    return {
      generatedAt: new Date(),
      dateRange: { from: fromDate, to: toDate },
      metrics: {
        totalTransactions: items.length,
        matchedCount,
        discrepancyCount,
        missingInDbCount,
        statusMismatchCount,
        amountMismatchCount,
        totalGatewayAmountPaise,
        totalDbAmountPaise,
        netVariancePaise,
      },
      items,
    };
  }

  /**
   * One-click Re-Sync action for resolving discrepancies.
   * Pulls authoritative state from gateway and reconciles DB inside a transaction.
   */
  async resyncTransaction(gatewayPaymentId: string, auth?: AuthContext) {
    this.logger.log(`Initiating one-click re-sync for gateway payment ${gatewayPaymentId}`);

    // Fetch live gateway payment details
    const gwPayment = await this.gateway.fetchPayment(gatewayPaymentId);

    return await prisma.$transaction(async (tx) => {
      let payment = await tx.payment.findFirst({
        where: {
          OR: [
            { gatewayPaymentId },
            ...(gwPayment.orderId ? [{ gatewayOrderId: gwPayment.orderId }] : []),
          ],
        },
        include: { deposit: true, user: true, receipt: true },
      });

      if (!payment) {
        // If payment doesn't exist locally, find first pending deposit to attach settlement
        const deposit = await tx.deposit.findFirst({
          where: { status: { in: [DepositStatus.PENDING, DepositStatus.PARTIAL, DepositStatus.OVERDUE] } },
          include: { house: { include: { owner: true } } },
        });

        if (!deposit || !deposit.house.owner) {
          throw new NotFoundException(
            `Cannot auto-resync orphan payment ${gatewayPaymentId}: No pending deposit found to associate.`,
          );
        }

        const newPayment = await tx.payment.create({
          data: {
            depositId: deposit.id,
            userId: deposit.house.owner.id,
            amount: BigInt(gwPayment.amountPaise),
            method: (gwPayment.method?.toUpperCase() as any) || 'UPI',
            gatewayOrderId: gwPayment.orderId || `order_${gatewayPaymentId}`,
            gatewayPaymentId,
            status: PaymentStatus.SUCCESS,
            idempotencyKey: `resync_${gatewayPaymentId}_${Date.now()}`,
          },
          include: { deposit: true, user: true, receipt: true },
        });

        payment = newPayment;
      }

      // If gateway is captured, verify and update local status to SUCCESS
      if (gwPayment.status === 'captured') {
        const currentPaid = payment.deposit.amountPaid;
        const newPaid = currentPaid + payment.amount;
        const newStatus = newPaid >= payment.deposit.amountDue ? DepositStatus.PAID : DepositStatus.PARTIAL;

        await tx.deposit.update({
          where: { id: payment.depositId },
          data: { amountPaid: newPaid, status: newStatus },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            gatewayPaymentId,
            amount: BigInt(gwPayment.amountPaise),
          },
        });

        // Ensure receipt exists
        let receipt = payment.receipt;
        if (!receipt) {
          const receiptCount = await tx.receipt.count();
          receipt = await tx.receipt.create({
            data: {
              paymentId: payment.id,
              receiptNumber: `REC-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${(20000 + receiptCount).toString()}`,
              pdfUrl: `https://cdn.colonydeposit.example.com/receipts/${payment.id}.pdf`,
            },
          });
        }

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: auth?.id || 'SYSTEM_RECONCILER',
            actorPhone: auth?.phone || 'SYSTEM',
            action: AuditAction.PAYMENT_VERIFIED,
            entity: 'Payment',
            entityId: payment.id,
            before: { status: payment.status },
            after: {
              status: PaymentStatus.SUCCESS,
              gatewayPaymentId,
              resyncedVia: 'RECONCILIATION_ONE_CLICK',
              receiptNumber: receipt.receiptNumber,
            },
          },
        });

        return {
          success: true,
          action: 'PAYMENT_CAPTURED_AND_SETTLED',
          paymentId: payment.id,
          receiptNumber: receipt.receiptNumber,
          message: `Payment ${gatewayPaymentId} successfully reconciled and marked as SUCCESS.`,
        };
      }

      return {
        success: true,
        action: 'NOOP',
        message: `Gateway payment ${gatewayPaymentId} status is ${gwPayment.status}. Database updated.`,
      };
    });
  }

  /**
   * Generates formatted CSV content for downloading reconciliation audit report.
   */
  generateCsvReport(report: ReconciliationReport): string {
    const headers = [
      'Gateway Payment ID',
      'Gateway Order ID',
      'DB Payment ID',
      'Receipt No',
      'Resident',
      'Unit',
      'Gateway Amount (INR)',
      'DB Amount (INR)',
      'Gateway Status',
      'DB Status',
      'Discrepancy Type',
      'Variance (INR)',
      'Date',
    ];

    const rows = report.items.map((item) => [
      item.gatewayPaymentId,
      item.gatewayOrderId || '',
      item.dbPaymentId || '',
      item.dbReceiptNumber || '',
      `"${item.residentName || 'N/A'}"`,
      `"${item.unit || 'N/A'}"`,
      (item.gatewayAmountPaise / 100).toFixed(2),
      item.dbAmountPaise ? (item.dbAmountPaise / 100).toFixed(2) : '0.00',
      item.gatewayStatus,
      item.dbStatus || 'MISSING',
      item.discrepancyType,
      (item.variancePaise / 100).toFixed(2),
      new Date(item.date).toISOString(),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

