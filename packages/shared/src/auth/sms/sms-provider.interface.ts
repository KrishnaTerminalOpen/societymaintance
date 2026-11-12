export interface SmsDeliveryResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export interface ISmsProvider {
  name: string;
  sendOtp(phone: string, otp: string): Promise<SmsDeliveryResult>;
}

