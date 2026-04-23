import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query
} from '@nestjs/common';

import { ReportingService } from './reporting.service';

@Controller()
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('brands/:brandId/reporting-periods')
  listReportingPeriods(
    @Param('brandId') brandCode: string,
    @Query('year') year?: string
  ) {
    const parsedYear = year ? Number(year) : null;
    const resolvedYear =
      parsedYear !== null && Number.isFinite(parsedYear) ? parsedYear : undefined;

    return this.reportingService.listReportingPeriods(brandCode, resolvedYear);
  }

  @Get('brands/:brandId/reporting-periods/recycle-bin')
  listReportingPeriodsRecycleBin(
    @Param('brandId') brandCode: string,
    @Query('year') year?: string
  ) {
    const parsedYear = year ? Number(year) : null;
    const resolvedYear =
      parsedYear !== null && Number.isFinite(parsedYear) ? parsedYear : undefined;

    return this.reportingService.listDeletedReportingPeriods(brandCode, resolvedYear);
  }

  @Get('brands/:brandId/reporting-periods/:periodId')
  getReportingPeriodDetail(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.reportingService.getReportingPeriodDetail(brandCode, periodId);
  }

  @Post('brands/:brandId/reporting-periods')
  createReportingPeriod(
    @Param('brandId') brandCode: string,
    @Body('year', ParseIntPipe) year: number,
    @Body('month', ParseIntPipe) month: number,
    @Body('replaceDeleted') replaceDeleted?: boolean,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.createReportingPeriod({
      brandCode,
      year,
      month,
      replaceDeleted,
      actorName,
      actorEmail
    });
  }

  @Post('brands/:brandId/reporting-periods/year-setup/prepare')
  prepareYearSetup(
    @Param('brandId') brandCode: string,
    @Body('targetYear', ParseIntPipe) targetYear: number,
    @Body('sourceYear') sourceYear?: string | number | null
  ) {
    const parsedSourceYear =
      sourceYear === null || sourceYear === undefined ? null : Number(sourceYear);
    const resolvedSourceYear =
      parsedSourceYear !== null && Number.isFinite(parsedSourceYear)
        ? parsedSourceYear
        : undefined;

    return this.reportingService.prepareYearSetup(brandCode, targetYear, resolvedSourceYear);
  }

  @Post('reporting-periods/:periodId/drafts')
  createOrResumeDraft(
    @Param('periodId') periodId: string,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.createOrResumeDraft(periodId, {
      actorName,
      actorEmail
    });
  }

  @Post('report-versions/:versionId/submit')
  submitVersion(
    @Param('versionId') versionId: string,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.submitVersion(versionId, {
      actorName,
      actorEmail
    });
  }

  @Post('report-versions/:versionId/approve')
  approveVersion(
    @Param('versionId') versionId: string,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.approveVersion(versionId, {
      actorName,
      actorEmail
    });
  }

  @Post('report-versions/:versionId/reject')
  rejectVersion(
    @Param('versionId') versionId: string,
    @Body('reason') reason: string,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.rejectVersion(versionId, { reason, actorName, actorEmail });
  }

  @Post('report-versions/:versionId/revise')
  reviseVersion(
    @Param('versionId') versionId: string,
    @Body('reason') reason?: string,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.reviseVersion(versionId, { reason, actorName, actorEmail });
  }

  @Post('report-versions/:versionId/reopen')
  reopenVersion(
    @Param('versionId') versionId: string,
    @Body('reason') reason?: string,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.reopenVersion(versionId, { reason, actorName, actorEmail });
  }

  @Delete('reporting-periods/:periodId')
  deleteReportingPeriod(
    @Param('periodId') periodId: string,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.deleteReportingPeriod(periodId, {
      actorName,
      actorEmail
    });
  }

  @Post('reporting-periods/:periodId/restore')
  restoreReportingPeriod(
    @Param('periodId') periodId: string,
    @Body('actorName') actorName?: string,
    @Body('actorEmail') actorEmail?: string
  ) {
    return this.reportingService.restoreReportingPeriod(periodId, {
      actorName,
      actorEmail
    });
  }
}
