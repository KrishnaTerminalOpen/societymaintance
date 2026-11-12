import { Injectable, Logger } from '@nestjs/common';
import { IEmailProvider, SendEmailOptions, ProviderResult } from '../../interfaces/notification.interface';

@Injectable()
export class ConsoleEmailProvider implements IEmailProvider {
  readonly name = 'Console';
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async sendEmail(options: SendEmailOptions): Promise<ProviderResult> {
    this.logger.log(
      `\n================= [DEV EMAIL NOTIFICATION] =================\n` +
      `TO:      ${options.to}\n` +
      `SUBJECT: ${options.subject}\n` +
      `TEXT:    ${options.text || options.subject}\n` +
      `============================================================`,
    );
    return {
      success: true,
      messageId: `console_email_${Date.now()}`,
    };
  }
}

