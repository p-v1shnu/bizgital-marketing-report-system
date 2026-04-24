import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { BrandRole } from '@prisma/client';

export type AuthenticatedRequestUser = {
  id: string;
  email: string;
  displayName: string;
  hasAdminRole: boolean;
  brandMemberships: Array<{
    brandId: string;
    role: BrandRole;
  }>;
  internal?: boolean;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedRequestUser;
    }>();

    return request.user;
  }
);
