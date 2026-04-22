import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BrandsModule } from '../brands/brands.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { KpiModule } from '../kpi/kpi.module';
import { ManualMetricsModule } from '../manual-metrics/manual-metrics.module';
import { MediaModule } from '../media/media.module';
import { MetricsModule } from '../metrics/metrics.module';
import { QuestionsModule } from '../questions/questions.module';
import { TopContentModule } from '../top-content/top-content.module';
import { ReportingController } from './reporting.controller';
import { ReviewReadinessService } from './review-readiness.service';
import { ReportingService } from './reporting.service';

@Module({
  imports: [
    BrandsModule,
    AuditLogModule,
    CompetitorsModule,
    KpiModule,
    ManualMetricsModule,
    MediaModule,
    MetricsModule,
    QuestionsModule,
    TopContentModule
  ],
  controllers: [ReportingController],
  providers: [ReportingService, ReviewReadinessService]
})
export class ReportingModule {}
