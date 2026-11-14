import { ISmsProvider } from './sms-provider.interface';
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
    return new TwilioSmsProvider(twilioSid!.trim(), twilioToken!.trim(), twilioFrom!.trim());
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
      fast2SmsKey!.trim(),
      process.env.FAST2SMS_SENDER_ID,
      process.env.FAST2SMS_TEMPLATE_ID,
    );
  }

  // Auto-select first configured real provider
  if (hasTwilio) {
    return new TwilioSmsProvider(twilioSid!.trim(), twilioToken!.trim(), twilioFrom!.trim());
  }
  if (hasMsg91) {
    return new Msg91SmsProvider(
      msg91Key!.trim(),
      msg91Template!.trim(),
      process.env.MSG91_SENDER_ID || 'COLONY',
    );
  }
  if (hasFast2Sms) {
    return new Fast2SmsProvider(
      fast2SmsKey!.trim(),
      process.env.FAST2SMS_SENDER_ID,
      process.env.FAST2SMS_TEMPLATE_ID,
    );
  }

  // When real SMS mode is requested but keys aren't added, log a warning and fallback gracefully to demo OTP
  if (devConsoleFlag === 'false') {
    console.warn('⚠️ No real SMS provider keys configured in .env. Falling back to Console SMS for demo testing.');
  }

  // Fallback to Dev Console logger for smooth testing
  return new ConsoleSmsProvider();
}
