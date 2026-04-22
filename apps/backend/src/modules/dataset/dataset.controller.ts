import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { DatasetService } from './dataset.service';
import type { UpdateDatasetValuesInput } from './dataset.types';

@Controller('brands/:brandId/reporting-periods/:periodId')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Get('dataset')
  getDatasetOverview(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.datasetService.getDatasetOverview(brandCode, periodId);
  }

  @Post('dataset')
  updateDatasetValues(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string,
    @Body() body: UpdateDatasetValuesInput
  ) {
    return this.datasetService.updateDatasetValues(brandCode, periodId, body);
  }
}
