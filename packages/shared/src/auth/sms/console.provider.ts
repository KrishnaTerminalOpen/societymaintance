import { ISmsProvider, SmsDeliveryResult } from './sms-provider.interface';

export class ConsoleSmsProvider implements ISmsProvider {
  name = 'DevConsole';

  async sendOtp(phone: string, otp: string): Promise<SmsDeliveryResult> {
    console.info('\n' + '─'.repeat(54));
    console.info(`🔑 [COLONYDEPOSIT DEV MODE] OTP Code for ${phone}:`);
    console.info(`                >>> ${otp} <<<`);
    console.info(`                Valid for 5 minutes (max 3 attempts)`);
    console.info('─'.repeat(54) + '\n');

    return {
      success: true,
      provider: this.name,
      messageId: `dev-${Date.now()}`,
    };
  }
}

