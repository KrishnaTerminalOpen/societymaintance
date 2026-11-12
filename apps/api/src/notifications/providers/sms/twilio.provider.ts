import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsProvider, SendSmsOptions, ProviderResult } from '../../interfaces/notification.interface';

@Injectable()
export class TwilioSmsProvider implements ISmsProvider {
  readonly name = 'Twilio';
  private readonly logger = new Logger(TwilioSmsProvider.name);
  private readonly accountSid?: string;
  private readonly authToken?: string;
  private readonly fromPhone?: string;

  constructor(private readonly config: ConfigService) {
    this.accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    this.authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    this.fromPhone = this.config.get<string>('TWILIO_PHONE_NUMBER');
  }

  async sendSms(options: SendSmsOptions): Promise<ProviderResult> {
    if (!this.accountSid || !this.authToken || this.accountSid === 'mock_twilio_sid') {
      this.logger.log(`[Twilio SMS Simulation] To: ${options.to} | Message: ${options.message}`);
      return { success: true, messageId: `tw_sim_${Date.now()}` };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const body = new URLSearchParams();
      body.append('To', options.to);
      body.append('From', this.fromPhone || '');
      body.append('Body', options.message);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json();
      if (response.ok) {
        return { success: true, messageId: data.sid };
      }
      return { success: false, error: data.message || 'Twilio send failure' };
    } catch (err: any) {
      this.logger.error(`Twilio Send Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

