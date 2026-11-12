import { Injectable, Logger } from '@nestjs/common';
import { ISmsProvider, SendSmsOptions, ProviderResult } from '../../interfaces/notification.interface';

@Injectable()
export class ConsoleSmsProvider implements ISmsProvider {
  readonly name = 'Console';
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async sendSms(options: SendSmsOptions): Promise<ProviderResult> {
    this.logger.log(
      `\n================= [DEV SMS NOTIFICATION] =================\n` +
      `TO:      ${options.to}\n` +
      `MESSAGE: ${options.message}\n` +
      `==========================================================`,
    );
    return {
      success: true,
      messageId: `console_sms_${Date.now()}`,
    };
  }
}

