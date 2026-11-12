import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Ip,
  Headers,
} from '@nestjs/common';
import { PaymentsService, CreateOrderDto, VerifyPaymentDto, ReviewRefundDto } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Request } from 'express';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('create-order')
  async createOrder(
    @Body() dto: CreateOrderDto,
    @Req() req: Request,
    @Ip() clientIp: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const user = (req as any).user;
    return this.paymentsService.createOrder(
      dto,
      {
        id: user.sub,
        phone: user.phone,
        role: user.role,
        name: user.name,
      },
      clientIp,
      userAgent,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify')
  async verifyPayment(
    @Body() dto: VerifyPaymentDto,
    @Req() req: Request,
    @Ip() clientIp: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const user = (req as any).user;
    return this.paymentsService.verifyPayment(
      dto,
      {
        id: user.sub,
        phone: user.phone,
        role: user.role,
        name: user.name,
      },
      clientIp,
      userAgent,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('poll-stuck')
  async triggerStuckPoller() {
    const resolved = await this.paymentsService.pollStuckPayments();
    return { success: true, resolvedPaymentsCount: resolved };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('refunds/review')
  async reviewRefund(
    @Body() dto: ReviewRefundDto,
    @Req() req: Request,
    @Ip() clientIp: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const user = (req as any).user;
    return this.paymentsService.reviewRefundRequest(
      dto,
      {
        id: user.sub,
        phone: user.phone,
        role: user.role,
        name: user.name,
      },
      clientIp,
      userAgent,
    );
  }
}

