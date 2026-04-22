import { Module } from '@nestjs/common';

import { BrandsModule } from '../brands/brands.module';
import { ColumnConfigModule } from '../column-config/column-config.module';
import { KpiModule } from '../kpi/kpi.module';
import { ManualMetricsModule } from '../manual-metrics/manual-metrics.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [BrandsModule, ColumnConfigModule, KpiModule, ManualMetricsModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService]
})
export class MetricsModule {}
