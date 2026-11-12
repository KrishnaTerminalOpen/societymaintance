import { ISmsProvider, SmsDeliveryResult } from './sms-provider.interface';

export class TwilioSmsProvider implements ISmsProvider {
  name = 'Twilio';

  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string,
  ) {}

  async sendOtp(phone: string, otp: string): Promise<SmsDeliveryResult> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const basicAuth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const body = new URLSearchParams();
      body.append('To', phone.startsWith('+') ? phone : `+91${phone}`);
      body.append('From', this.fromNumber);
      body.append('Body', `Your ColonyDeposit verification code is ${otp}. Valid for 5 minutes.`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = (await response.json()) as { sid?: string; message?: string };

      if (!response.ok || !data.sid) {
        return {
          success: false,
          provider: this.name,
          error: data.message || `Twilio dispatch failed with status ${response.status}`,
        };
      }

      return {
        success: true,
        provider: this.name,
        messageId: data.sid,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : 'Unknown Twilio network error',
      };
    }
  }
}

