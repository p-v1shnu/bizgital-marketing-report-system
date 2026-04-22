import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BrandsModule } from '../brands/brands.module';
import { MediaModule } from '../media/media.module';
import { CompetitorSetupController } from './competitor-setup.controller';
import { CompetitorsController } from './competitors.controller';
import { CompetitorsService } from './competitors.service';

@Module({
  imports: [BrandsModule, MediaModule, AuditLogModule],
  controllers: [CompetitorsController, CompetitorSetupController],
  providers: [CompetitorsService],
  exports: [CompetitorsService]
})
export class CompetitorsModule {}
