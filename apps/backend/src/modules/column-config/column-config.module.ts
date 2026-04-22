import { Module } from '@nestjs/common';

import { ColumnConfigController } from './column-config.controller';
import { ColumnConfigService } from './column-config.service';

@Module({
  controllers: [ColumnConfigController],
  providers: [ColumnConfigService],
  exports: [ColumnConfigService]
})
export class ColumnConfigModule {}
