import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IWhatsAppProvider, SendWhatsAppOptions, ProviderResult } from '../../interfaces/notification.interface';

@Injectable()
export class WhatsAppCloudProvider implements IWhatsAppProvider {
  readonly name = 'WhatsApp Cloud API';
  private readonly logger = new Logger(WhatsAppCloudProvider.name);
  private readonly accessToken?: string;
  private readonly phoneNumberId?: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
  }

  async sendWhatsApp(options: SendWhatsAppOptions): Promise<ProviderResult> {
    if (!this.accessToken || !this.phoneNumberId || this.accessToken === 'mock_wa_token') {
      this.logger.log(`[WhatsApp Simulation] To: ${options.to} | Message: ${options.message}`);
      return { success: true, messageId: `wa_sim_${Date.now()}` };
    }

    try {
      const formattedTo = options.to.replace(/\+/g, '').replace(/[^0-9]/g, '');
      const url = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedTo,
          type: 'text',
          text: { preview_url: true, body: options.message },
        }),
      });

      const data = await response.json();
      if (response.ok && data.messages?.[0]?.id) {
        return { success: true, messageId: data.messages[0].id };
      }
      return { success: false, error: JSON.stringify(data.error || 'WhatsApp send failed') };
    } catch (err: any) {
      this.logger.error(`WhatsApp Cloud API Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

