import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { TopContentService } from './top-content.service';

@Controller('brands/:brandId/reporting-periods/:periodId/top-content')
export class TopContentController {
  constructor(private readonly topContentService: TopContentService) {}

  @Get()
  getOverview(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.topContentService.getOverview(brandCode, periodId);
  }

  @Post('regenerate')
  regenerate(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.topContentService.regenerateForPeriod(brandCode, periodId);
  }

  @Post(':cardId')
  updateCard(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string,
    @Param('cardId') cardId: string,
    @Body()
    body: {
      screenshotUrl?: string | null;
      actorName?: string | null;
      actorEmail?: string | null;
    }
  ) {
    return this.topContentService.updateCard(brandCode, periodId, cardId, body);
  }
}
