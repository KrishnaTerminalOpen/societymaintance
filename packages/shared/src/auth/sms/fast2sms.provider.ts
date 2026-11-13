import { ISmsProvider, SmsDeliveryResult } from './sms-provider.interface';

export class Fast2SmsProvider implements ISmsProvider {
  name = 'Fast2SMS';

  constructor(
    private apiKey: string,
    private senderId?: string,
    private templateId?: string,
  ) {}

  async sendOtp(phone: string, otp: string): Promise<SmsDeliveryResult> {
    try {
      const mobile10 = phone.replace(/\D/g, '').slice(-10);

      // Use DLT route if senderId & templateId are non-empty, otherwise use Fast2SMS Quick OTP route
      const hasDlt = Boolean(
        this.senderId && this.senderId.trim().length > 0 &&
        this.templateId && this.templateId.trim().length > 0
      );

      const payload: Record<string, string> = hasDlt
        ? {
            route: 'dlt',
            sender_id: this.senderId!.trim(),
            message: this.templateId!.trim(),
            variables_values: otp,
            flash: '0',
            numbers: mobile10,
          }
        : {
            route: 'otp',
            variables_values: otp,
            flash: '0',
            numbers: mobile10,
          };

      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        return?: boolean;
        request_id?: string;
        message?: string | string[];
      };

      if (!response.ok || data.return === false) {
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        return {
          success: false,
          provider: this.name,
          error: msg || `Fast2SMS failed with status ${response.status}`,
        };
      }

      return {
        success: true,
        provider: this.name,
        messageId: data.request_id,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : 'Unknown Fast2SMS network error',
      };
    }
  }
}

