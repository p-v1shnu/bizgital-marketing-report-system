import { Controller, Get, Query } from '@nestjs/common';

import { AuditLogService } from './audit-log.service';

@Controller('admin')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('audit-logs')
  listAuditLogs(
    @Query('actorEmail') actorEmail?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const parsedPage = page ? Number(page) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;

    return this.auditLogService.listForAdmin({
      actorEmail,
      q,
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined
    });
  }
}

