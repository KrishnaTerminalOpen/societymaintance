import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { HealthController } from './health/health.controller';
import { AppService } from './app.service';
import { PaymentsModule } from './payments/payments.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

function getBullConnection() {
  if (process.env.REDIS_URL) {
    try {
      const parsed = new URL(process.env.REDIS_URL);
      return {
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
        ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
      };
    } catch {
      // Fallback to host/port below
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: getBullConnection(),
    }),
    StorageModule,
    NotificationsModule,
    ReceiptsModule,
    PaymentsModule,
    ReconciliationModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
