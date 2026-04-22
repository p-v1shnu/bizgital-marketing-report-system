import { Module } from '@nestjs/common';

import { BrandsModule } from '../brands/brands.module';
import { ColumnConfigModule } from '../column-config/column-config.module';
import { DatasetModule } from '../dataset/dataset.module';
import { MetricsModule } from '../metrics/metrics.module';
import { TopContentModule } from '../top-content/top-content.module';
import { MappingController } from './mapping.controller';
import { MappingService } from './mapping.service';

@Module({
  imports: [BrandsModule, ColumnConfigModule, DatasetModule, MetricsModule, TopContentModule],
  controllers: [MappingController],
  providers: [MappingService]
})
export class MappingModule {}
