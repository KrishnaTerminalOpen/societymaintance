import { AppLogger } from '../logging/logger';

export interface AlertPayload {
  title: string;
  severity: 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  service: 'payments' | 'webhooks' | 'auth' | 'reconciliation' | 'queues';
  message: string;
  details?: Record<string, any>;
  timestamp?: string;
}

export class AlertService {
  private static webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL; // Slack/Discord/OpsGenie webhook

  /**
   * Broadcast an alert for critical operational/financial anomalies
   */
  static async sendAlert(alert: AlertPayload): Promise<void> {
    const alertData = {
      ...alert,
      timestamp: alert.timestamp || new Date().toISOString(),
    };

    // 1. Structured log for monitoring/log aggregators (Datadog/CloudWatch)
    AppLogger.error(`🚨 [ALERT - ${alertData.severity}] [${alertData.service}] ${alertData.title}: ${alertData.message}`, {
      context: 'AlertService',
      severity: alertData.severity,
      service: alertData.service,
      details: alertData.details,
    });

    // 2. Dispatch to Ops Webhook if configured
    if (this.webhookUrl) {
      try {
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `*🚨 [${alertData.severity}] ${alertData.title}*\n*Service:* ${alertData.service}\n*Message:* ${alertData.message}\n\`\`\`${JSON.stringify(alertData.details || {}, null, 2)}\`\`\``,
          }),
        });
      } catch (err) {
        console.error('Failed to dispatch alert to OPS_ALERT_WEBHOOK_URL:', err);
      }
    }
  }

  /**
   * Helper: Alert on Payment Failure / Signature mismatch
   */
  static async alertPaymentFailure(orderId: string, paymentId: string, reason: string, details?: Record<string, any>) {
    await this.sendAlert({
      title: 'Payment Verification Failure',
      severity: 'CRITICAL',
      service: 'payments',
      message: `Payment verification failed for order ${orderId} / payment ${paymentId}: ${reason}`,
      details: {
        orderId,
        paymentId,
        reason,
        ...details,
      },
    });
  }

  /**
   * Helper: Alert on Razorpay Webhook Processing Failure or DLQ drop
   */
  static async alertWebhookError(eventId: string, eventType: string, error: any) {
    await this.sendAlert({
      title: 'Gateway Webhook Processing Error',
      severity: 'CRITICAL',
      service: 'webhooks',
      message: `Failed to process webhook event ${eventType} (${eventId})`,
      details: {
        eventId,
        eventType,
        error: error?.message || String(error),
      },
    });
  }
}

