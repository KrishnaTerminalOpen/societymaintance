export interface SendSmsOptions {
  to: string;
  message: string;
  templateId?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendWhatsAppOptions {
  to: string;
  message: string;
  templateName?: string;
  parameters?: Record<string, string>;
}

export interface ProviderResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ISmsProvider {
  readonly name: string;
  sendSms(options: SendSmsOptions): Promise<ProviderResult>;
}

export interface IEmailProvider {
  readonly name: string;
  sendEmail(options: SendEmailOptions): Promise<ProviderResult>;
}

export interface IWhatsAppProvider {
  readonly name: string;
  sendWhatsApp(options: SendWhatsAppOptions): Promise<ProviderResult>;
}

export const SMS_PROVIDER = 'SMS_PROVIDER';
export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';
export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';

