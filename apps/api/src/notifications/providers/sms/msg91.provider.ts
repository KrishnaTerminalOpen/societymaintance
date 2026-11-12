import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsProvider, SendSmsOptions, ProviderResult } from '../../interfaces/notification.interface';

@Injectable()
export class Msg91SmsProvider implements ISmsProvider {
  readonly name = 'MSG91';
  private readonly logger = new Logger(Msg91SmsProvider.name);
  private readonly authKey?: string;
  private readonly senderId?: string;

  constructor(private readonly config: ConfigService) {
    this.authKey = this.config.get<string>('MSG91_AUTH_KEY');
    this.senderId = this.config.get<string>('MSG91_SENDER_ID') || 'COLONY';
  }

  async sendSms(options: SendSmsOptions): Promise<ProviderResult> {
    if (!this.authKey || this.authKey === 'mock_msg91_key') {
      this.logger.log(`[MSG91 Simulation] To: ${options.to} | Message: ${options.message}`);
      return { success: true, messageId: `msg91_sim_${Date.now()}` };
    }

    try {
      const response = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          authkey: this.authKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          template_id: options.templateId || this.config.get('MSG91_TEMPLATE_ID'),
          sender: this.senderId,
          short_url: '0',
          mobiles: options.to.replace(/\+/g, ''),
          var1: options.message,
        }),
      });

      const data = await response.json();
      if (response.ok && data.type !== 'error') {
        return { success: true, messageId: data.message_id || data.request_id };
      }
      return { success: false, error: data.message || 'MSG91 API error' };
    } catch (err: any) {
      this.logger.error(`MSG91 Send Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

