import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MappingTargetField } from '@prisma/client';

import { MappingService } from './mapping.service';

@Controller('brands/:brandId/reporting-periods/:periodId')
export class MappingController {
  constructor(private readonly mappingService: MappingService) {}

  @Get('mapping')
  getMappingOverview(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.mappingService.getMappingOverview(brandCode, periodId);
  }

  @Post('mapping')
  saveMappings(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string,
    @Body('mappings')
    mappings: Array<{
      importColumnProfileId: string;
      targetField: MappingTargetField | null;
    }>
  ) {
    return this.mappingService.saveMappings(brandCode, periodId, mappings);
  }

  @Post('mapping/auto')
  autoMapLatestImportJob(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.mappingService.autoMapLatestImportJob(brandCode, periodId);
  }
}
