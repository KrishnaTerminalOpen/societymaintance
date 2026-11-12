import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  SMS_PROVIDER,
  EMAIL_PROVIDER,
  WHATSAPP_PROVIDER,
} from './interfaces/notification.interface';
import { Msg91SmsProvider } from './providers/sms/msg91.provider';
import { TwilioSmsProvider } from './providers/sms/twilio.provider';
import { ConsoleSmsProvider } from './providers/sms/console-sms.provider';
import { ResendEmailProvider } from './providers/email/resend.provider';
import { SendGridEmailProvider } from './providers/email/sendgrid.provider';
import { ConsoleEmailProvider } from './providers/email/console-email.provider';
import { WhatsAppCloudProvider } from './providers/whatsapp/whatsapp-cloud.provider';
import { ConsoleWhatsAppProvider } from './providers/whatsapp/console-whatsapp.provider';
import { NotificationsService } from './notifications.service';
import { DeadLetterQueueService } from './dlq.service';
import { NotificationProcessor } from './processors/notification.processor';
import { ReminderProcessor } from './processors/reminder.processor';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue(
      { name: 'notifications-queue' },
      { name: 'reminders-queue' },
      { name: 'receipts-queue' },
    ),
  ],
  controllers: [NotificationsController],
  providers: [
    Msg91SmsProvider,
    TwilioSmsProvider,
    ConsoleSmsProvider,
    ResendEmailProvider,
    SendGridEmailProvider,
    ConsoleEmailProvider,
    WhatsAppCloudProvider,
    ConsoleWhatsAppProvider,
    NotificationsService,
    DeadLetterQueueService,
    NotificationProcessor,
    ReminderProcessor,
    {
      provide: SMS_PROVIDER,
      useFactory: (
        config: ConfigService,
        msg91: Msg91SmsProvider,
        twilio: TwilioSmsProvider,
        consoleSms: ConsoleSmsProvider,
      ) => {
        const provider = config.get<string>('SMS_PROVIDER')?.toLowerCase();
        if (provider === 'msg91') return msg91;
        if (provider === 'twilio') return twilio;
        return consoleSms;
      },
      inject: [ConfigService, Msg91SmsProvider, TwilioSmsProvider, ConsoleSmsProvider],
    },
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        config: ConfigService,
        resend: ResendEmailProvider,
        sendgrid: SendGridEmailProvider,
        consoleEmail: ConsoleEmailProvider,
      ) => {
        const provider = config.get<string>('EMAIL_PROVIDER')?.toLowerCase();
        if (provider === 'resend') return resend;
        if (provider === 'sendgrid') return sendgrid;
        return consoleEmail;
      },
      inject: [ConfigService, ResendEmailProvider, SendGridEmailProvider, ConsoleEmailProvider],
    },
    {
      provide: WHATSAPP_PROVIDER,
      useFactory: (
        config: ConfigService,
        cloud: WhatsAppCloudProvider,
        consoleWa: ConsoleWhatsAppProvider,
      ) => {
        const hasToken = !!config.get<string>('WHATSAPP_ACCESS_TOKEN');
        if (hasToken) return cloud;
        return consoleWa;
      },
      inject: [ConfigService, WhatsAppCloudProvider, ConsoleWhatsAppProvider],
    },
  ],
  exports: [
    NotificationsService,
    DeadLetterQueueService,
    SMS_PROVIDER,
    EMAIL_PROVIDER,
    WHATSAPP_PROVIDER,
  ],
})
export class NotificationsModule {}

