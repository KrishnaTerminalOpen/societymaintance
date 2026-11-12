import { Injectable, Logger } from '@nestjs/common';
import { IWhatsAppProvider, SendWhatsAppOptions, ProviderResult } from '../../interfaces/notification.interface';

@Injectable()
export class ConsoleWhatsAppProvider implements IWhatsAppProvider {
  readonly name = 'Console';
  private readonly logger = new Logger(ConsoleWhatsAppProvider.name);

  async sendWhatsApp(options: SendWhatsAppOptions): Promise<ProviderResult> {
    this.logger.log(
      `\n=============== [DEV WHATSAPP NOTIFICATION] ===============\n` +
      `TO:      ${options.to}\n` +
      `MESSAGE: ${options.message}\n` +
      `============================================================`,
    );
    return {
      success: true,
      messageId: `console_wa_${Date.now()}`,
    };
  }
}

