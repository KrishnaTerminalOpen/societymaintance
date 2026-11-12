import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  prisma,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@colony/database';
import { formatPaiseToINR } from '@colony/shared';
import {
  SMS_PROVIDER,
  EMAIL_PROVIDER,
  WHATSAPP_PROVIDER,
  ISmsProvider,
  IEmailProvider,
  IWhatsAppProvider,
} from './interfaces/notification.interface';

export interface DispatchNotificationDto {
  userId: string;
  type: NotificationType;
  channel?: NotificationChannel | 'ALL';
  phone?: string;
  email?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(SMS_PROVIDER) private readonly smsProvider: ISmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: IEmailProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsappProvider: IWhatsAppProvider,
  ) {}

  /**
   * Builds template message strings and titles for each notification type.
   */
  buildMessage(type: NotificationType, metadata: Record<string, any> = {}): {
    title: string;
    text: string;
    html: string;
  } {
    const colonyName = metadata.colonyName || 'Colony RWA';
    const amount = metadata.amountPaise ? formatPaiseToINR(metadata.amountPaise) : '';
    const unit = metadata.unit || 'your registered unit';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://colonydeposit.in';

    switch (type) {
      case 'OTP': {
        const otp = metadata.otp || '000000';
        return {
          title: 'Your Verification Code',
          text: `Your ${colonyName} security deposit verification code is ${otp}. Valid for 5 minutes. Do not share this with anyone.`,
          html: `<div style="font-family:sans-serif;padding:20px;border-radius:8px;border:1px solid #e5e7eb;">
            <h2 style="color:#4f46e5;">ColonyDeposit Security Verification</h2>
            <p>Your one-time login code for <strong>${colonyName}</strong> is:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:4px;color:#111827;margin:20px 0;">${otp}</div>
            <p style="color:#6b7280;font-size:12px;">Valid for 5 minutes. Never disclose this code to anyone.</p>
          </div>`,
        };
      }

      case 'PAYMENT_SUCCESS': {
        const receiptNo = metadata.receiptNumber || 'N/A';
        const receiptUrl = metadata.pdfUrl || `${appUrl}/resident`;
        return {
          title: 'Deposit Payment Successful',
          text: `Dear Resident, your payment of ${amount} for unit ${unit} at ${colonyName} was successful. Receipt No: ${receiptNo}. Download: ${receiptUrl}`,
          html: `<div style="font-family:sans-serif;padding:20px;border-radius:8px;border:1px solid #e5e7eb;">
            <h2 style="color:#059669;">Deposit Payment Received</h2>
            <p>We have successfully verified your security deposit payment of <strong>${amount}</strong> for <strong>${unit}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:15px 0;">
              <tr><td style="color:#6b7280;padding:4px 0;">Colony:</td><td style="font-weight:bold;">${colonyName}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Receipt Number:</td><td style="font-weight:bold;">${receiptNo}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Status:</td><td style="color:#059669;font-weight:bold;">Verified & Credited</td></tr>
            </table>
            <div style="margin-top:20px;">
              <a href="${receiptUrl}" style="background-color:#4f46e5;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;">Download Official PDF Receipt</a>
            </div>
          </div>`,
        };
      }

      case 'PAYMENT_FAILED': {
        const reason = metadata.reason || 'Payment could not be completed at payment gateway.';
        const retryUrl = `${appUrl}/resident`;
        return {
          title: 'Payment Failed or Incomplete',
          text: `Payment attempt of ${amount} for ${unit} at ${colonyName} failed. Reason: ${reason}. Please retry: ${retryUrl}`,
          html: `<div style="font-family:sans-serif;padding:20px;border-radius:8px;border:1px solid #fee2e2;">
            <h2 style="color:#dc2626;">Payment Incomplete</h2>
            <p>Your security deposit payment attempt of <strong>${amount}</strong> for unit <strong>${unit}</strong> was not completed.</p>
            <p style="color:#b91c1c;"><strong>Reason:</strong> ${reason}</p>
            <div style="margin-top:20px;">
              <a href="${retryUrl}" style="background-color:#dc2626;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;">Retry Payment</a>
            </div>
          </div>`,
        };
      }

      case 'PAYMENT_DUE': {
        const dueDate = metadata.dueDate ? new Date(metadata.dueDate).toLocaleDateString('en-IN') : 'Immediately';
        const payUrl = `${appUrl}/resident`;
        return {
          title: 'Security Deposit Due Date Reminder',
          text: `Reminder from ${colonyName}: Your security deposit installment of ${amount} for ${unit} is due on ${dueDate}. Pay online: ${payUrl}`,
          html: `<div style="font-family:sans-serif;padding:20px;border-radius:8px;border:1px solid #fef3c7;">
            <h2 style="color:#d97706;">Security Deposit Due Reminder</h2>
            <p>This is a gentle reminder that your security deposit balance of <strong>${amount}</strong> for <strong>${unit}</strong> at <strong>${colonyName}</strong> is due on <strong>${dueDate}</strong>.</p>
            <p>Avoid last-minute late fees by paying easily from your mobile phone via UPI, Cards, or Net Banking.</p>
            <div style="margin-top:20px;">
              <a href="${payUrl}" style="background-color:#d97706;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;">Pay Deposit Now</a>
            </div>
          </div>`,
        };
      }

      case 'PAYMENT_OVERDUE': {
        const lateFee = metadata.lateFeePaise ? formatPaiseToINR(metadata.lateFeePaise) : 'applicable penalty';
        const payUrl = `${appUrl}/resident`;
        return {
          title: 'URGENT: Security Deposit Overdue',
          text: `URGENT: Your security deposit payment of ${amount} for ${unit} at ${colonyName} is OVERDUE. Late fee of ${lateFee} has been applied. Pay immediately: ${payUrl}`,
          html: `<div style="font-family:sans-serif;padding:20px;border-radius:8px;border:1px solid #fee2e2;">
            <h2 style="color:#b91c1c;">URGENT: Security Deposit Overdue Notice</h2>
            <p>Your security deposit obligation of <strong>${amount}</strong> for <strong>${unit}</strong> at <strong>${colonyName}</strong> has passed its due date.</p>
            <p style="color:#dc2626;"><strong>Notice:</strong> Continued non-compliance attracts a late fee (${lateFee}) and committee review.</p>
            <div style="margin-top:20px;">
              <a href="${payUrl}" style="background-color:#b91c1c;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;">Pay Overdue Deposit Now</a>
            </div>
          </div>`,
        };
      }

      case 'REFUND_PROCESSED': {
        const refundId = metadata.gatewayRefundId || metadata.refundId || 'N/A';
        return {
          title: 'Deposit Refund Processed',
          text: `A refund of ${amount} has been processed for unit ${unit} at ${colonyName}. Gateway Refund ID: ${refundId}.`,
          html: `<div style="font-family:sans-serif;padding:20px;border-radius:8px;border:1px solid #e0e7ff;">
            <h2 style="color:#4338ca;">Deposit Refund Processed</h2>
            <p>A refundable deposit amount of <strong>${amount}</strong> has been credited back to your original source account.</p>
            <p><strong>Reference / Refund ID:</strong> ${refundId}</p>
          </div>`,
        };
      }

      default:
        return {
          title: metadata.title || 'Colony Alert',
          text: metadata.message || 'Notification from your Colony Committee.',
          html: `<p>${metadata.message || 'Notification from your Colony Committee.'}</p>`,
        };
    }
  }

  /**
   * Dispatches notification across designated channel(s) and records in DB.
   */
  async dispatch(dto: DispatchNotificationDto): Promise<{ success: boolean; results: any[] }> {
    const { userId, type, channel = 'ALL', metadata = {} } = dto;

    // Fetch user details if phone/email not provided
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { houses: true },
    });

    if (!user) {
      this.logger.warn(`Cannot dispatch notification: User ${userId} not found`);
      return { success: false, results: [] };
    }

    const toPhone = dto.phone || user.phone;
    const toEmail = dto.email || user.email;

    // Populate unit metadata if missing
    if (!metadata.unit && user.houses.length > 0) {
      metadata.unit = `Block ${user.houses[0].block}-${user.houses[0].houseNumber}`;
    }

    const { title, text, html } = this.buildMessage(type, metadata);
    const results: any[] = [];

    // 1. Send SMS
    if (channel === 'ALL' || channel === 'SMS') {
      try {
        const smsRes = await this.smsProvider.sendSms({
          to: toPhone,
          message: text,
        });
        results.push({ channel: 'SMS', ...smsRes });

        await prisma.notification.create({
          data: {
            userId: user.id,
            title,
            message: text,
            type: type as any,
            channel: 'SMS',
            status: smsRes.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
            metadata: { ...metadata, messageId: smsRes.messageId, error: smsRes.error },
          },
        });
      } catch (err: any) {
        this.logger.error(`SMS send error for user ${user.id}: ${err.message}`);
        results.push({ channel: 'SMS', success: false, error: err.message });
      }
    }

    // 2. Send Email
    if ((channel === 'ALL' || channel === 'EMAIL') && toEmail) {
      try {
        const emailRes = await this.emailProvider.sendEmail({
          to: toEmail,
          subject: title,
          html,
          text,
        });
        results.push({ channel: 'EMAIL', ...emailRes });

        await prisma.notification.create({
          data: {
            userId: user.id,
            title,
            message: text,
            type: type as any,
            channel: 'EMAIL',
            status: emailRes.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
            metadata: { ...metadata, messageId: emailRes.messageId, error: emailRes.error },
          },
        });
      } catch (err: any) {
        this.logger.error(`Email send error for user ${user.id}: ${err.message}`);
        results.push({ channel: 'EMAIL', success: false, error: err.message });
      }
    }

    // 3. Send WhatsApp
    if (channel === 'ALL' || channel === 'WHATSAPP') {
      try {
        const waRes = await this.whatsappProvider.sendWhatsApp({
          to: toPhone,
          message: text,
        });
        results.push({ channel: 'WHATSAPP', ...waRes });

        await prisma.notification.create({
          data: {
            userId: user.id,
            title,
            message: text,
            type: type as any,
            channel: 'WHATSAPP',
            status: waRes.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
            metadata: { ...metadata, messageId: waRes.messageId, error: waRes.error },
          },
        });
      } catch (err: any) {
        this.logger.error(`WhatsApp send error for user ${user.id}: ${err.message}`);
        results.push({ channel: 'WHATSAPP', success: false, error: err.message });
      }
    }

    // 4. In-App Notification (Always stored so resident can view in dashboard)
    if (channel !== 'SMS' && channel !== 'EMAIL' && channel !== 'WHATSAPP') {
      await prisma.notification.create({
        data: {
          userId: user.id,
          title,
          message: text,
          type: type as any,
          channel: 'IN_APP',
          status: NotificationStatus.SENT,
          metadata,
        },
      });
    }

    return {
      success: results.some((r) => r.success),
      results,
    };
  }
}

