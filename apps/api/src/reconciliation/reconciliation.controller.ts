import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * GET /reconciliation/report
   * Runs cross-system comparison and returns discrepancy report.
   */
  @Get('report')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async getReport(@Query('from') from?: string, @Query('to') to?: string) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const report = await this.reconciliationService.runReconciliation(fromDate, toDate);
    return {
      success: true,
      report,
    };
  }

  /**
   * POST /reconciliation/resync
   * Triggers one-click re-sync to repair flagged discrepancies.
   */
  @Post('resync')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async resyncTransaction(@Body('gatewayPaymentId') gatewayPaymentId: string, @Req() req: any) {
    if (!gatewayPaymentId) {
      throw new BadRequestException('gatewayPaymentId is required for re-sync');
    }

    const admin = req.user;
    const result = await this.reconciliationService.resyncTransaction(gatewayPaymentId, {
      id: admin.sub,
      phone: admin.phone,
      role: admin.role,
      name: admin.name,
    });

    return result;
  }

  /**
   * GET /reconciliation/export
   * Exports reconciliation audit report as CSV.
   */
  @Get('export')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async exportReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const report = await this.reconciliationService.runReconciliation(fromDate, toDate);
    const csv = this.reconciliationService.generateCsvReport(report);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reconciliation-report-${new Date().toISOString().split('T')[0]}.csv"`,
    );
    res.status(200).send(csv);
  }
}

