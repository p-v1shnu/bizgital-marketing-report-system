import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthRateLimitGuard } from '../auth/auth-rate-limit.guard';
import { Public } from '../auth/public.decorator';
import type {
  BootstrapSuperAdminInput,
  CreateUserInput,
  DeleteUserInput,
  MicrosoftLoginInput,
  PasswordLoginInput,
  UpdateUserInput
} from './users.types';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers() {
    return this.usersService.listUsers();
  }

  @Get('bootstrap/status')
  @Public()
  getBootstrapStatus() {
    return this.usersService.getBootstrapStatus();
  }

  @Post('bootstrap/super-admin')
  @Public()
  bootstrapSuperAdmin(@Body() body: BootstrapSuperAdminInput) {
    return this.usersService.bootstrapSuperAdmin(body);
  }

  @Post()
  createUser(@Body() body: CreateUserInput) {
    return this.usersService.createUser(body);
  }

  @Post('auth/password-login')
  @Public()
  @UseGuards(AuthRateLimitGuard)
  passwordLogin(@Body() body: PasswordLoginInput) {
    return this.usersService.passwordLogin(body);
  }

  @Post('auth/microsoft-login')
  @Public()
  @UseGuards(AuthRateLimitGuard)
  microsoftLogin(@Body() body: MicrosoftLoginInput) {
    return this.usersService.microsoftLogin(body);
  }

  @Post(':userId')
  updateUser(@Param('userId') userId: string, @Body() body: UpdateUserInput) {
    return this.usersService.updateUser(userId, body);
  }

  @Delete(':userId')
  deleteUser(@Param('userId') userId: string, @Body() body: DeleteUserInput) {
    return this.usersService.deleteUser(userId, body);
  }
}
