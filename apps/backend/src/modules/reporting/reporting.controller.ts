import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnauthorizedException
} from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedRequestUser
} from '../auth/current-user.decorator';
import { ReportingService } from './reporting.service';

function actorFromUser(user: AuthenticatedRequestUser | undefined) {
  if (!user || user.internal) {
    throw new UnauthorizedException('Authenticated user context is required.');
  }

  return {
    actorName: user.displayName,
    actorEmail: user.email
  };
}

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
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    const actor = actorFromUser(user);

    return this.reportingService.createReportingPeriod({
      brandCode,
      year,
      month,
      replaceDeleted,
      ...actor
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
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.reportingService.createOrResumeDraft(periodId, actorFromUser(user));
  }

  @Post('report-versions/:versionId/submit')
  submitVersion(
    @Param('versionId') versionId: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.reportingService.submitVersion(versionId, actorFromUser(user));
  }

  @Post('report-versions/:versionId/approve')
  approveVersion(
    @Param('versionId') versionId: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.reportingService.approveVersion(versionId, actorFromUser(user));
  }

  @Post('report-versions/:versionId/reject')
  rejectVersion(
    @Param('versionId') versionId: string,
    @Body('reason') reason: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.reportingService.rejectVersion(versionId, {
      reason,
      ...actorFromUser(user)
    });
  }

  @Post('report-versions/:versionId/revise')
  reviseVersion(
    @Param('versionId') versionId: string,
    @Body('reason') reason?: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.reportingService.reviseVersion(versionId, {
      reason,
      ...actorFromUser(user)
    });
  }

  @Post('report-versions/:versionId/reopen')
  reopenVersion(
    @Param('versionId') versionId: string,
    @Body('reason') reason?: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.reportingService.reopenVersion(versionId, {
      reason,
      ...actorFromUser(user)
    });
  }

  @Delete('reporting-periods/:periodId')
  deleteReportingPeriod(
    @Param('periodId') periodId: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.reportingService.deleteReportingPeriod(periodId, actorFromUser(user));
  }

  @Post('reporting-periods/:periodId/restore')
  restoreReportingPeriod(
    @Param('periodId') periodId: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.reportingService.restoreReportingPeriod(periodId, actorFromUser(user));
  }
}
