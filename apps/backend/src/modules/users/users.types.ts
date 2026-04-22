import type { BrandRole, UserStatus } from '@prisma/client';

export type UserSignInMethod =
  | 'microsoft_only'
  | 'password_only'
  | 'microsoft_and_password';

export type UserMembershipInput = {
  brandCode: string;
  role: BrandRole;
  permissions?: {
    canCreateReports?: boolean;
    canApproveReports?: boolean;
  };
};

export type CreateUserInput = {
  email: string;
  displayName: string;
  status?: UserStatus;
  signInMethod?: UserSignInMethod;
  password?: string;
  memberships?: UserMembershipInput[];
  actorName?: string;
  actorEmail?: string;
};

export type UpdateUserInput = {
  email?: string;
  displayName?: string;
  status?: UserStatus;
  signInMethod?: UserSignInMethod;
  password?: string;
  memberships?: UserMembershipInput[];
  replaceMemberships?: boolean;
  actorName?: string;
  actorEmail?: string;
};

export type DeleteUserInput = {
  actorName?: string;
  actorEmail?: string;
};

export type PasswordLoginInput = {
  email: string;
  password: string;
};

export type MicrosoftLoginInput = {
  oid: string;
  email?: string;
  displayName?: string;
};

export type BootstrapSetupMode = 'auto' | 'force' | 'disabled';

export type BootstrapStatusResponse = {
  mode: BootstrapSetupMode;
  setupRequired: boolean;
  enforceSetup: boolean;
  hasBootstrapSuperAdmin: boolean;
  activeAdminCount: number;
  reason:
    | 'ready'
    | 'disabled'
    | 'forced_for_testing'
    | 'missing_bootstrap_super_admin';
};

export type BootstrapSuperAdminInput = {
  email: string;
  displayName: string;
  password: string;
};
