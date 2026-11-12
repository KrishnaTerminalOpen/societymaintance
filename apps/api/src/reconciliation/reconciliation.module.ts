import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationJob } from './reconciliation.job';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, ReconciliationJob],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}

