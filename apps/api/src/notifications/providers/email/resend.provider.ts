import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmailProvider, SendEmailOptions, ProviderResult } from '../../interfaces/notification.interface';

@Injectable()
export class ResendEmailProvider implements IEmailProvider {
  readonly name = 'Resend';
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly apiKey?: string;
  private readonly fromEmail: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromEmail = this.config.get<string>('EMAIL_FROM') || 'ColonyDeposit <receipts@colonydeposit.com>';
  }

  async sendEmail(options: SendEmailOptions): Promise<ProviderResult> {
    if (!this.apiKey || this.apiKey === 'mock_resend_key') {
      this.logger.log(`[Resend Email Simulation] To: ${options.to} | Subject: ${options.subject}`);
      return { success: true, messageId: `resend_sim_${Date.now()}` };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        return { success: true, messageId: data.id };
      }
      return { success: false, error: data.message || 'Resend error' };
    } catch (err: any) {
      this.logger.error(`Resend Email Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

