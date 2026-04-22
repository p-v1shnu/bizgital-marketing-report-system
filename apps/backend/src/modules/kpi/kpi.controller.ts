import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { KpiService } from './kpi.service';
import type {
  CreateKpiCatalogInput,
  UpdateNewBrandDefaultKpiSelectionInput,
  UpdateBrandKpiPlanInput,
  UpdateKpiCatalogInput
} from './kpi.types';

@Controller()
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  @Get('config/kpis')
  listCatalog(@Query('includeInactive') includeInactive?: string) {
    return this.kpiService.listCatalog(includeInactive === 'true');
  }

  @Post('config/kpis')
  createCatalogItem(@Body() body: CreateKpiCatalogInput) {
    return this.kpiService.createCatalogItem(body);
  }

  @Get('config/kpis/defaults')
  getNewBrandDefaultKpiSelection() {
    return this.kpiService.getNewBrandDefaultKpiSelection();
  }

  @Post('config/kpis/defaults')
  updateNewBrandDefaultKpiSelection(
    @Body() body: UpdateNewBrandDefaultKpiSelectionInput
  ) {
    return this.kpiService.updateNewBrandDefaultKpiSelection(body);
  }

  @Post('config/kpis/:kpiId')
  updateCatalogItem(@Param('kpiId') kpiId: string, @Body() body: UpdateKpiCatalogInput) {
    return this.kpiService.updateCatalogItem(kpiId, body);
  }

  @Delete('config/kpis/:kpiId')
  deleteCatalogItem(@Param('kpiId') kpiId: string) {
    return this.kpiService.deleteCatalogItem(kpiId);
  }

  @Get('brands/:brandCode/kpi-plans/:year')
  getBrandKpiPlan(@Param('brandCode') brandCode: string, @Param('year') year: string) {
    return this.kpiService.getBrandKpiPlan(brandCode, Number(year));
  }

  @Post('brands/:brandCode/kpi-plans/:year')
  updateBrandKpiPlan(
    @Param('brandCode') brandCode: string,
    @Param('year') year: string,
    @Body() body: UpdateBrandKpiPlanInput
  ) {
    return this.kpiService.updateBrandKpiPlan(brandCode, Number(year), body);
  }
}
