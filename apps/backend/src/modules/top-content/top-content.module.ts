import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BrandsModule } from '../brands/brands.module';
import { ColumnConfigModule } from '../column-config/column-config.module';
import { MediaModule } from '../media/media.module';
import { TopContentController } from './top-content.controller';
import { TopContentService } from './top-content.service';

@Module({
  imports: [BrandsModule, ColumnConfigModule, MediaModule, AuditLogModule],
  controllers: [TopContentController],
  providers: [TopContentService],
  exports: [TopContentService]
})
export class TopContentModule {}
