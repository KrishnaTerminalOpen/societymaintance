import { ISmsProvider, SmsDeliveryResult } from './sms-provider.interface';

export class Msg91SmsProvider implements ISmsProvider {
  name = 'MSG91';

  constructor(
    private authKey: string,
    private templateId: string,
    private senderId = 'COLONY',
  ) {}

  async sendOtp(phone: string, otp: string): Promise<SmsDeliveryResult> {
    try {
      // Format phone: ensure numeric without + prefix for MSG91
      const formattedPhone = phone.replace(/\D/g, '');

      const response = await fetch('https://control.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: this.authKey,
        },
        body: JSON.stringify({
          template_id: this.templateId,
          mobile: formattedPhone,
          otp: otp,
          sender: this.senderId,
        }),
      });

      const data = (await response.json()) as { type?: string; message?: string };

      if (!response.ok || data.type === 'error') {
        return {
          success: false,
          provider: this.name,
          error: data.message || `MSG91 failed with status ${response.status}`,
        };
      }

      return {
        success: true,
        provider: this.name,
        messageId: data.message,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : 'Unknown MSG91 network error',
      };
    }
  }
}

