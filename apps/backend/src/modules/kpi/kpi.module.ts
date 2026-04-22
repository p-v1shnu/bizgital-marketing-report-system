import { Module } from '@nestjs/common';

import { BrandsModule } from '../brands/brands.module';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';

@Module({
  imports: [BrandsModule],
  controllers: [KpiController],
  providers: [KpiService],
  exports: [KpiService]
})
export class KpiModule {}
