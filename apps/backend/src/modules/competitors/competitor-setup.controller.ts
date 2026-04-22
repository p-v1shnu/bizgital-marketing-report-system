import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post
} from '@nestjs/common';

import { CompetitorsService } from './competitors.service';
import type {
  SaveCompetitorMasterInput,
  UpdateAssignmentStatusInput,
  UpdateCompetitorMasterInput
} from './competitors.types';

@Controller('brands/:brandId/competitor-setup')
export class CompetitorSetupController {
  constructor(private readonly competitorsService: CompetitorsService) {}

  @Get('catalog')
  getCatalog(@Param('brandId') brandCode: string) {
    return this.competitorsService.getCatalog(brandCode);
  }

  @Post('catalog')
  createCompetitor(
    @Param('brandId') brandCode: string,
    @Body() body: SaveCompetitorMasterInput
  ) {
    return this.competitorsService.createMaster(brandCode, body);
  }

  @Patch('catalog/:competitorId')
  updateCompetitor(
    @Param('brandId') brandCode: string,
    @Param('competitorId') competitorId: string,
    @Body() body: UpdateCompetitorMasterInput
  ) {
    return this.competitorsService.updateMaster(brandCode, competitorId, body);
  }

  @Delete('catalog/:competitorId')
  deleteCompetitor(
    @Param('brandId') brandCode: string,
    @Param('competitorId') competitorId: string
  ) {
    return this.competitorsService.deleteMaster(brandCode, competitorId);
  }

  @Get(':year')
  getYearSetup(
    @Param('brandId') brandCode: string,
    @Param('year', ParseIntPipe) year: number
  ) {
    return this.competitorsService.getYearSetup(brandCode, year);
  }

  @Post(':year/assignments')
  saveYearAssignments(
    @Param('brandId') brandCode: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() body: { competitorIds?: string[] | null }
  ) {
    return this.competitorsService.saveYearAssignments(
      brandCode,
      year,
      body.competitorIds ?? []
    );
  }

  @Patch(':year/assignments/:competitorId/status')
  updateAssignmentStatus(
    @Param('brandId') brandCode: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('competitorId') competitorId: string,
    @Body() body: UpdateAssignmentStatusInput
  ) {
    return this.competitorsService.updateAssignmentStatus(
      brandCode,
      year,
      competitorId,
      body
    );
  }

  @Post(':targetYear/copy-from/:sourceYear')
  copyYearAssignments(
    @Param('brandId') brandCode: string,
    @Param('targetYear', ParseIntPipe) targetYear: number,
    @Param('sourceYear', ParseIntPipe) sourceYear: number
  ) {
    return this.competitorsService.copyYearAssignments(
      brandCode,
      sourceYear,
      targetYear
    );
  }
}
