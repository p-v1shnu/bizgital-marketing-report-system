import { Controller, Get, Param, Post } from '@nestjs/common';

import { MetricsService } from './metrics.service';

@Controller('brands/:brandId/reporting-periods/:periodId')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  getMetricsOverview(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.metricsService.getMetricsOverview(brandCode, periodId);
  }

  @Get('metrics/preview')
  getMetricsPreview(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.metricsService.getKpiPreview(brandCode, periodId);
  }

  @Post('metrics/regenerate')
  regenerateMetricsSnapshot(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.metricsService.regenerateSnapshotForPeriod(brandCode, periodId);
  }
}
