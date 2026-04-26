import { Module } from '@nestjs/common';

import { BrandsModule } from '../brands/brands.module';
import { ColumnConfigModule } from '../column-config/column-config.module';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';

@Module({
  imports: [BrandsModule, ColumnConfigModule],
  controllers: [KpiController],
  providers: [KpiService],
  exports: [KpiService]
})
export class KpiModule {}
