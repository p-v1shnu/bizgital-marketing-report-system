import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CompetitorsService } from './competitors.service';
import type { SaveCompetitorMonitoringInput } from './competitors.types';

@Controller('brands/:brandId/reporting-periods/:periodId/competitors')
export class CompetitorsController {
  constructor(private readonly competitorsService: CompetitorsService) {}

  @Get()
  getOverview(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.competitorsService.getOverview(brandCode, periodId);
  }

  @Post(':competitorId/monitoring')
  saveMonitoring(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string,
    @Param('competitorId') competitorId: string,
    @Body() body: SaveCompetitorMonitoringInput
  ) {
    return this.competitorsService.saveMonitoring(
      brandCode,
      periodId,
      competitorId,
      body
    );
  }
}
