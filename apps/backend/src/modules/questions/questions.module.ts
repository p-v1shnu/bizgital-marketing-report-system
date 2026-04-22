import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BrandsModule } from '../brands/brands.module';
import { MediaModule } from '../media/media.module';
import {
  QuestionCatalogController,
  QuestionSetupController,
  QuestionsController
} from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  imports: [BrandsModule, MediaModule, AuditLogModule],
  controllers: [QuestionsController, QuestionSetupController, QuestionCatalogController],
  providers: [QuestionsService],
  exports: [QuestionsService]
})
export class QuestionsModule {}
