import { ISmsProvider, SmsDeliveryResult } from './sms-provider.interface';
import { Msg91SmsProvider } from './msg91.provider';
import { TwilioSmsProvider } from './twilio.provider';
import { Fast2SmsProvider } from './fast2sms.provider';
import { ConsoleSmsProvider } from './console.provider';

let customProvider: ISmsProvider | null = null;

export function setSmsProvider(provider: ISmsProvider): void {
  customProvider = provider;
}

function isRealCredential(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !/^(dummy|your[_-]|sample|placeholder|<)/i.test(trimmed);
}

class UnconfiguredSmsProvider implements ISmsProvider {
  name = 'Unconfigured';

  async sendOtp(): Promise<SmsDeliveryResult> {
    return {
      success: false,
      provider: this.name,
      error:
        'Real SMS provider is not configured. Add TWILIO_*, MSG91_*, or FAST2SMS_API_KEY credentials to .env (or set DEV_OTP_CONSOLE=true for demo OTP).',
    };
  }
}

export function getSmsProvider(): ISmsProvider {
  if (customProvider) {
    return customProvider;
  }

  const devConsoleFlag = process.env.DEV_OTP_CONSOLE;
  if (devConsoleFlag === 'true') {
    return new ConsoleSmsProvider();
  }

  const preferred = process.env.SMS_PROVIDER?.toLowerCase();

  // 1. Check Twilio credentials
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  const hasTwilio =
    isRealCredential(twilioSid) &&
    isRealCredential(twilioToken) &&
    isRealCredential(twilioFrom);

  // 2. Check MSG91 credentials
  const msg91Key = process.env.MSG91_AUTH_KEY;
  const msg91Template = process.env.MSG91_TEMPLATE_ID;
  const hasMsg91 = isRealCredential(msg91Key) && isRealCredential(msg91Template);

  // 3. Check Fast2SMS credentials
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;
  const hasFast2Sms = isRealCredential(fast2SmsKey);

  if (preferred === 'twilio' && hasTwilio) {
    return new TwilioSmsProvider(twilioSid!, twilioToken!, twilioFrom!);
  }
  if (preferred === 'msg91' && hasMsg91) {
    return new Msg91SmsProvider(
      msg91Key!,
      msg91Template!,
      process.env.MSG91_SENDER_ID || 'COLONY',
    );
  }
  if (preferred === 'fast2sms' && hasFast2Sms) {
    return new Fast2SmsProvider(
      fast2SmsKey!,
      process.env.FAST2SMS_SENDER_ID,
      process.env.FAST2SMS_TEMPLATE_ID,
    );
  }

  // Auto-select first configured real provider
  if (hasTwilio) {
    return new TwilioSmsProvider(twilioSid!, twilioToken!, twilioFrom!);
  }
  if (hasMsg91) {
    return new Msg91SmsProvider(
      msg91Key!,
      msg91Template!,
      process.env.MSG91_SENDER_ID || 'COLONY',
    );
  }
  if (hasFast2Sms) {
    return new Fast2SmsProvider(
      fast2SmsKey!,
      process.env.FAST2SMS_SENDER_ID,
      process.env.FAST2SMS_TEMPLATE_ID,
    );
  }

  // When real SMS mode is explicitly requested (DEV_OTP_CONSOLE=false), never silently generate demo OTPs
  if (devConsoleFlag === 'false') {
    return new UnconfiguredSmsProvider();
  }

  // Fallback to Dev Console logger when running locally without DEV_OTP_CONSOLE=false
  return new ConsoleSmsProvider();
}
