import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { BrandsModule } from './modules/brands/brands.module';
import { ColumnConfigModule } from './modules/column-config/column-config.module';
import { CompetitorsModule } from './modules/competitors/competitors.module';
import { DatasetModule } from './modules/dataset/dataset.module';
import { HealthController } from './modules/health/health.controller';
import { ImportsModule } from './modules/imports/imports.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { MappingModule } from './modules/mapping/mapping.module';
import { MediaModule } from './modules/media/media.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { TopContentModule } from './modules/top-content/top-content.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditLogModule,
    BrandsModule,
    ColumnConfigModule,
    CompetitorsModule,
    DatasetModule,
    ImportsModule,
    KpiModule,
    MappingModule,
    MediaModule,
    MetricsModule,
    QuestionsModule,
    ReportingModule,
    TopContentModule,
    UsersModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
