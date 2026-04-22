import { Module } from '@nestjs/common';

import { ManualMetricsService } from './manual-metrics.service';

@Module({
  providers: [ManualMetricsService],
  exports: [ManualMetricsService]
})
export class ManualMetricsModule {}
