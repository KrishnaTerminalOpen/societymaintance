import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmailProvider, SendEmailOptions, ProviderResult } from '../../interfaces/notification.interface';

@Injectable()
export class SendGridEmailProvider implements IEmailProvider {
  readonly name = 'SendGrid';
  private readonly logger = new Logger(SendGridEmailProvider.name);
  private readonly apiKey?: string;
  private readonly fromEmail: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('SENDGRID_API_KEY');
    this.fromEmail = this.config.get<string>('EMAIL_FROM') || 'ColonyDeposit <receipts@colonydeposit.com>';
  }

  async sendEmail(options: SendEmailOptions): Promise<ProviderResult> {
    if (!this.apiKey || this.apiKey === 'mock_sendgrid_key') {
      this.logger.log(`[SendGrid Email Simulation] To: ${options.to} | Subject: ${options.subject}`);
      return { success: true, messageId: `sg_sim_${Date.now()}` };
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: options.to }] }],
          from: { email: this.fromEmail },
          subject: options.subject,
          content: [
            { type: 'text/plain', value: options.text || options.subject },
            { type: 'text/html', value: options.html },
          ],
        }),
      });

      if (response.status === 202) {
        const messageId = response.headers.get('x-message-id') || `sg_${Date.now()}`;
        return { success: true, messageId };
      }
      const data = await response.json();
      return { success: false, error: JSON.stringify(data.errors || 'SendGrid error') };
    } catch (err: any) {
      this.logger.error(`SendGrid Email Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

