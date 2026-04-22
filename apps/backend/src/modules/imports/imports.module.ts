import { Module } from '@nestjs/common';

import { BrandsModule } from '../brands/brands.module';
import { ColumnConfigModule } from '../column-config/column-config.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [BrandsModule, ColumnConfigModule],
  controllers: [ImportsController],
  providers: [ImportsService]
})
export class ImportsModule {}
