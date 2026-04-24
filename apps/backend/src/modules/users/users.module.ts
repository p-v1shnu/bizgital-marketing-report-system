import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthRateLimitGuard } from '../auth/auth-rate-limit.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [UsersController],
  providers: [UsersService, AuthRateLimitGuard],
  exports: [UsersService]
})
export class UsersModule {}
