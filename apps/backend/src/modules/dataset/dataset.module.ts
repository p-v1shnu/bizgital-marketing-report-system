import { Module } from '@nestjs/common';

import { BrandsModule } from '../brands/brands.module';
import { ColumnConfigModule } from '../column-config/column-config.module';
import { ManualMetricsModule } from '../manual-metrics/manual-metrics.module';
import { MetricsModule } from '../metrics/metrics.module';
import { TopContentModule } from '../top-content/top-content.module';
import { DatasetController } from './dataset.controller';
import { DatasetMaterializerService } from './dataset-materializer.service';
import { DatasetService } from './dataset.service';

@Module({
  imports: [BrandsModule, ColumnConfigModule, MetricsModule, ManualMetricsModule, TopContentModule],
  controllers: [DatasetController],
  providers: [DatasetService, DatasetMaterializerService],
  exports: [DatasetMaterializerService]
})
export class DatasetModule {}
