import { ISmsProvider } from './sms-provider.interface';
import { Msg91SmsProvider } from './msg91.provider';
import { TwilioSmsProvider } from './twilio.provider';
import { ConsoleSmsProvider } from './console.provider';

let customProvider: ISmsProvider | null = null;

export function setSmsProvider(provider: ISmsProvider): void {
  customProvider = provider;
}

export function getSmsProvider(): ISmsProvider {
  if (customProvider) {
    return customProvider;
  }

  const forceDev = process.env.DEV_OTP_CONSOLE === 'true';

  // 1. Check for explicit MSG91 configuration
  const msg91Key = process.env.MSG91_AUTH_KEY;
  const msg91Template = process.env.MSG91_TEMPLATE_ID;
  if (msg91Key && msg91Template && !forceDev) {
    return new Msg91SmsProvider(
      msg91Key,
      msg91Template,
      process.env.MSG91_SENDER_ID || 'COLONY',
    );
  }

  // 2. Fallback to Twilio if MSG91 is not present
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  if (twilioSid && twilioToken && twilioFrom && !forceDev) {
    return new TwilioSmsProvider(twilioSid, twilioToken, twilioFrom);
  }

  // 3. Fallback to Dev Console logger when running locally / no provider configured
  return new ConsoleSmsProvider();
}
