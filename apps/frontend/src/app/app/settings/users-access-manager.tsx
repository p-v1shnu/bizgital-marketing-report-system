'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import type { BrandSummary, UserSummary } from '@/lib/reporting-api';

type Props = {
  users: UserSummary[];
  brands: BrandSummary[];
  actorName?: string;
  actorEmail?: string;
};

type SignInMethod = 'microsoft_only' | 'password_only' | 'microsoft_and_password';
type UserRole = 'admin' | 'content' | 'approver' | 'viewer';
type RoleFieldValue = UserRole | 'super_admin_global';

type UserDraft = {
  displayName: string;
  email: string;
  password: string;
  signInMethod: SignInMethod;
  brandCodes: string[];
  role: UserRole;
  canCreateReports: boolean;
  canApproveReports: boolean;
};

const MIN_PASSWORD_LENGTH = 8;

function defaultPermissionsForRole(role: UserRole) {
  if (role === 'admin') {
    return {
      canCreateReports: true,
      canApproveReports: true
    };
  }

  if (role === 'content') {
    return {
      canCreateReports: true,
      canApproveReports: false
    };
  }

  if (role === 'approver') {
    return {
      canCreateReports: false,
      canApproveReports: true
    };
  }

  return {
    canCreateReports: false,
    canApproveReports: false
  };
}

function createEmptyDraft(): UserDraft {
  return {
    displayName: '',
    email: '',
    password: '',
    signInMethod: 'microsoft_only',
    brandCodes: [],
    role: 'viewer',
    ...defaultPermissionsForRole('viewer')
  };
}

function normalizeUserRole(value: string | null | undefined): UserRole {
  if (value === 'admin' || value === 'content' || value === 'approver') {
    return value;
  }

  return 'viewer';
}

function uniqueTextList(values: string[]) {
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(value => !!value)
    )
  );
}

function parseErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    Array.isArray((payload as { message?: unknown }).message)
  ) {
    return ((payload as { message: string[] }).message).join(', ');
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof (payload as { message?: unknown }).message === 'string'
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
}

function signInLabelFromMethod(signInMethod: SignInMethod) {
  if (signInMethod === 'microsoft_and_password') {
    return 'Microsoft + Password';
  }

  if (signInMethod === 'microsoft_only') {
    return 'Microsoft only';
  }

  return 'Password only';
}

function inferSignInMethodFromUser(user: UserSummary): SignInMethod {
  if (user.signInMethod) {
    return user.signInMethod;
  }

  if (user.microsoftLinked && user.hasPassword) {
    return 'microsoft_and_password';
  }

  if (user.microsoftLinked) {
    return 'microsoft_only';
  }

  return user.hasPassword ? 'password_only' : 'microsoft_only';
}

function signInLabel(user: UserSummary) {
  return signInLabelFromMethod(inferSignInMethodFromUser(user));
}

function isProtectedSuperAdmin(user: UserSummary) {
  return user.isBootstrapSuperAdmin === true;
}

function isGlobalBootstrapSuperAdmin(user: UserSummary | null | undefined) {
  return !!user && user.isBootstrapSuperAdmin === true && user.memberships.length === 0;
}

function signInHelperText(signInMethod: SignInMethod) {
  if (signInMethod === 'microsoft_only') {
    return 'Sign in with Microsoft Entra ID only. No local password is stored.';
  }

  if (signInMethod === 'password_only') {
    return 'Sign in with local app password only.';
  }

  return 'Allow both Microsoft Entra ID and local password sign-in.';
}

function requiresPassword(signInMethod: SignInMethod) {
  return signInMethod !== 'microsoft_only';
}

export function UsersAccessManager({ users, brands, actorName, actorEmail }: Props) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3003/api';
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UserDraft>(createEmptyDraft);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<UserSummary | null>(null);
  const [brandSearchText, setBrandSearchText] = useState('');
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);

  const usersById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const editingUser = editingUserId ? usersById.get(editingUserId) ?? null : null;
  const showGlobalSuperAdminRole = isGlobalBootstrapSuperAdmin(editingUser);
  const roleFieldValue: RoleFieldValue = showGlobalSuperAdminRole
    ? 'super_admin_global'
    : draft.role;
  const allBrandCodes = useMemo(() => brands.map(brand => brand.code), [brands]);
  const brandNameByCode = useMemo(
    () => new Map(brands.map(brand => [brand.code, brand.name] as const)),
    [brands]
  );
  const filteredBrands = useMemo(() => {
    const keyword = brandSearchText.trim().toLowerCase();
    if (!keyword) {
      return brands;
    }

    return brands.filter(
      brand =>
        brand.name.toLowerCase().includes(keyword) ||
        brand.code.toLowerCase().includes(keyword)
    );
  }, [brandSearchText, brands]);
  const selectedBrandCodeSet = useMemo(() => new Set(draft.brandCodes), [draft.brandCodes]);
  const filteredBrandCodes = useMemo(
    () => filteredBrands.map(brand => brand.code),
    [filteredBrands]
  );
  const allFilteredBrandsSelected =
    filteredBrandCodes.length > 0 &&
    filteredBrandCodes.every(brandCode => selectedBrandCodeSet.has(brandCode));
  const selectedBrandCount = selectedBrandCodeSet.size;
  const selectedBrandSummary = useMemo(() => {
    if (selectedBrandCount === 0) {
      return 'Select brands';
    }

    if (selectedBrandCount === 1) {
      const selectedCode = draft.brandCodes[0] ?? '';
      return brandNameByCode.get(selectedCode) ?? selectedCode;
    }

    return `${selectedBrandCount} brands selected`;
  }, [brandNameByCode, draft.brandCodes, selectedBrandCount]);

  function openCreateModal() {
    setModalMode('create');
    setEditingUserId(null);
    setDraft(createEmptyDraft());
    setBrandSearchText('');
    setBrandPickerOpen(false);
    setStatusError(null);
  }

  function openEditModal(user: UserSummary) {
    const hasAdminMembership = user.memberships.some(
      membership => normalizeUserRole(membership.role) === 'admin'
    );
    const initialRole = hasAdminMembership
      ? 'admin'
      : normalizeUserRole(user.memberships[0]?.role);
    const roleMemberships = user.memberships.filter(
      membership => normalizeUserRole(membership.role) === initialRole
    );
    const firstMembership = roleMemberships[0] ?? user.memberships[0] ?? null;
    const defaultPermissions = defaultPermissionsForRole(initialRole);
    const initialBrandCodes =
      initialRole === 'admin'
        ? allBrandCodes
        : uniqueTextList(roleMemberships.map(membership => membership.brand.code));

    setModalMode('edit');
    setEditingUserId(user.id);
    setDraft({
      displayName: user.displayName,
      email: user.email,
      password: '',
      signInMethod: inferSignInMethodFromUser(user),
      brandCodes: initialBrandCodes,
      role: initialRole,
      canCreateReports:
        firstMembership?.permissions?.canCreateReports ??
        defaultPermissions.canCreateReports,
      canApproveReports:
        firstMembership?.permissions?.canApproveReports ??
        defaultPermissions.canApproveReports
    });
    setBrandSearchText('');
    setBrandPickerOpen(false);
    setStatusError(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditingUserId(null);
    setDraft(createEmptyDraft());
    setBrandSearchText('');
    setBrandPickerOpen(false);
    setPendingKey(null);
  }

  function updateRole(nextRole: UserRole) {
    const defaults = defaultPermissionsForRole(nextRole);
    setDraft(current => ({
      ...current,
      role: nextRole,
      brandCodes: uniqueTextList(
        nextRole === 'admin' ? allBrandCodes : current.brandCodes
      ),
      canCreateReports: defaults.canCreateReports,
      canApproveReports: defaults.canApproveReports
    }));
    if (nextRole === 'admin') {
      setBrandPickerOpen(false);
    }
  }

  async function saveUser() {
    if (!modalMode) {
      return;
    }

    setPendingKey('save');
    setStatusError(null);
    setStatusMessage(null);

    const normalizedPassword = draft.password.trim();
    const passwordRequired = requiresPassword(draft.signInMethod);
    const editingHasPassword = !!editingUser?.hasPassword;

    if (!draft.displayName.trim() || !draft.email.trim()) {
      setStatusError('Display name and email are required.');
      setPendingKey(null);
      return;
    }

    if (!passwordRequired && normalizedPassword) {
      setStatusError('Microsoft only account cannot include a local password.');
      setPendingKey(null);
      return;
    }

    if (
      modalMode === 'create' &&
      passwordRequired &&
      normalizedPassword.length < MIN_PASSWORD_LENGTH
    ) {
      setStatusError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      setPendingKey(null);
      return;
    }

    if (
      modalMode === 'edit' &&
      passwordRequired &&
      !editingHasPassword &&
      normalizedPassword.length < MIN_PASSWORD_LENGTH
    ) {
      setStatusError(
        `Set a password with at least ${MIN_PASSWORD_LENGTH} characters for this sign-in method.`
      );
      setPendingKey(null);
      return;
    }

    if (normalizedPassword && normalizedPassword.length < MIN_PASSWORD_LENGTH) {
      setStatusError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      setPendingKey(null);
      return;
    }

    const resolvedBrandCodes = uniqueTextList(
      draft.role === 'admin' ? allBrandCodes : draft.brandCodes
    );
    const resolvedCanCreateReports =
      draft.role === 'admin' ? true : draft.canCreateReports;
    const resolvedCanApproveReports =
      draft.role === 'admin'
        ? true
        : draft.role === 'content'
          ? false
          : draft.canApproveReports;
    const membershipPayload =
      resolvedBrandCodes.length > 0
        ? resolvedBrandCodes.map(brandCode => ({
            brandCode,
            role: draft.role,
            permissions: {
              canCreateReports: resolvedCanCreateReports,
              canApproveReports: resolvedCanApproveReports
            }
          }))
        : [];

    try {
      if (modalMode === 'create') {
        const response = await fetch(`${apiBase}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            displayName: draft.displayName,
            email: draft.email,
            signInMethod: draft.signInMethod,
            actorName,
            actorEmail,
            ...(normalizedPassword ? { password: normalizedPassword } : {}),
            ...(membershipPayload.length > 0
              ? {
                  memberships: membershipPayload
                }
              : {})
          })
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setStatusError(parseErrorMessage(payload, 'Failed to create user.'));
          return;
        }

        setStatusMessage(`User "${draft.displayName}" created.`);
      } else if (editingUserId) {
        const skipMembershipUpdate =
          editingUser?.isBootstrapSuperAdmin === true &&
          editingUser.memberships.length === 0;
        const response = await fetch(`${apiBase}/users/${editingUserId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            displayName: draft.displayName,
            email: draft.email,
            signInMethod: draft.signInMethod,
            actorName,
            actorEmail,
            ...(normalizedPassword ? { password: normalizedPassword } : {}),
            ...(!skipMembershipUpdate
              ? {
                  replaceMemberships: true,
                  memberships: membershipPayload
                }
              : {})
          })
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setStatusError(parseErrorMessage(payload, 'Failed to update user.'));
          return;
        }

        setStatusMessage(`User "${draft.displayName}" updated.`);
      }

      closeModal();
      router.refresh();
    } catch {
      setStatusError(modalMode === 'create' ? 'Failed to create user.' : 'Failed to update user.');
    } finally {
      setPendingKey(null);
    }
  }

  async function toggleUserStatus(user: UserSummary) {
    if (isProtectedSuperAdmin(user)) {
      setStatusError('Bootstrap Super Admin account must stay active.');
      return;
    }

    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    setPendingKey(`toggle:${user.id}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/users/${user.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: user.displayName,
          email: user.email,
          status: nextStatus,
          actorName,
          actorEmail
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to update user status.'));
        return;
      }

      setStatusMessage(
        nextStatus === 'active'
          ? `User "${user.displayName}" activated.`
          : `User "${user.displayName}" deactivated.`
      );
      router.refresh();
    } catch {
      setStatusError('Failed to update user status.');
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteUser(user: UserSummary) {
    if (isProtectedSuperAdmin(user)) {
      setStatusError('Bootstrap Super Admin account cannot be deleted.');
      return;
    }

    setPendingKey(`delete:${user.id}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actorName,
          actorEmail
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to delete user.'));
        return;
      }

      setDeleteTargetUser(null);
      setStatusMessage(`User "${user.displayName}" deleted.`);
      router.refresh();
    } catch {
      setStatusError('Failed to delete user.');
    } finally {
      setPendingKey(null);
    }
  }

  function requestDeleteUser(user: UserSummary) {
    setDeleteTargetUser(user);
    setStatusError(null);
    setStatusMessage(null);
  }

  return (
    <div className="space-y-3">
      {statusError ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[22px] border border-border/60 bg-background/60">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-lg font-semibold text-foreground">Users</div>
            <div className="text-sm text-muted-foreground">
              Manage accounts from the Actions column.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openCreateModal} size="sm" type="button">
              + Create User
            </Button>
          </div>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/70 text-xs uppercase tracking-[0.15em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Sign-in</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Capabilities</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={7}>
                  No users found.
                </td>
              </tr>
            ) : (
              users.map(user => (
                <tr className="border-b border-border/50 last:border-b-0" key={user.id}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <span>{user.displayName}</span>
                      {isProtectedSuperAdmin(user) ? (
                        <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                          Bootstrap Super Admin
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{signInLabel(user)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {isGlobalBootstrapSuperAdmin(user)
                      ? 'Super Admin (Global)'
                      : user.memberships.length > 0
                      ? Array.from(
                          new Set(
                            user.memberships.map(membership =>
                              normalizeUserRole(membership.role)
                            )
                          )
                        ).join(', ')
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {user.memberships.length > 0 ? (
                      <div className="space-y-1">
                        <div>
                          Create report:{' '}
                          {user.memberships.some(
                            membership => membership.permissions?.canCreateReports
                          )
                            ? 'Yes'
                            : 'No'}
                        </div>
                        <div>
                          Approve report:{' '}
                          {user.memberships.some(
                            membership => membership.permissions?.canApproveReports
                          )
                            ? 'Yes'
                            : 'No'}
                        </div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      aria-label={user.status === 'active' ? 'Set inactive' : 'Set active'}
                      className={`h-7 w-14 rounded-full border transition ${
                        user.status === 'active'
                          ? 'border-emerald-600/20 bg-emerald-500/40'
                          : 'border-border bg-muted'
                      }`}
                      disabled={
                        pendingKey === `toggle:${user.id}` || isProtectedSuperAdmin(user)
                      }
                      onClick={() => toggleUserStatus(user)}
                      type="button"
                    >
                      <span
                        className={`mx-1 block h-5 w-5 rounded-full bg-background transition-transform ${
                          user.status === 'active' ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    {user.status === 'invited' ? (
                      <div className="mt-1 text-xs text-muted-foreground">Invited</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => openEditModal(user)} size="sm" type="button" variant="outline">
                        Edit User
                      </Button>
                      <Button
                        className="text-rose-500 hover:text-rose-400"
                        disabled={
                          pendingKey === `delete:${user.id}` || isProtectedSuperAdmin(user)
                        }
                        onClick={() => requestDeleteUser(user)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalMode ? (
        <ModalShell
          onClose={closeModal}
          title={modalMode === 'create' ? 'Create User' : 'Edit User'}
          widthClassName="max-w-2xl"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <p className="text-sm text-muted-foreground">
                Add a teammate, choose how they sign in, and keep role access in this app.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="user-display-name-input">
                Name
              </label>
              <Input
                id="user-display-name-input"
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, displayName: value }));
                }}
                placeholder="Jane Doe"
                value={draft.displayName}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="user-email-input">
                Email
              </label>
              <Input
                id="user-email-input"
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, email: value }));
                }}
                placeholder="name@company.com"
                type="email"
                value={draft.email}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="user-sign-in-method-input">
                Sign-in Method
              </label>
              <Select
                id="user-sign-in-method-input"
                onChange={event => {
                  const value = event.currentTarget.value as SignInMethod;
                  setDraft(current => ({ ...current, signInMethod: value }));
                }}
                value={draft.signInMethod}
              >
                <option value="microsoft_only">Microsoft only</option>
                <option value="password_only">Password only</option>
                <option value="microsoft_and_password">Microsoft and password</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="user-role-input">
                Role
              </label>
              <Select
                id="user-role-input"
                disabled={editingUser?.isBootstrapSuperAdmin}
                onChange={event => {
                  const selectedValue = event.currentTarget.value as RoleFieldValue;
                  if (selectedValue === 'super_admin_global') {
                    return;
                  }

                  const value = normalizeUserRole(selectedValue);
                  updateRole(value);
                }}
                value={roleFieldValue}
              >
                {showGlobalSuperAdminRole ? (
                  <option value="super_admin_global">Super Admin (Global)</option>
                ) : null}
                <option value="admin">Admin</option>
                <option value="content">Content Team</option>
                <option value="approver">Approver</option>
                <option value="viewer">Viewer</option>
              </Select>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-3 text-sm text-muted-foreground md:col-span-2">
              {signInHelperText(draft.signInMethod)}
            </div>

            {requiresPassword(draft.signInMethod) ? (
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="user-password-input">
                  {modalMode === 'create' ? 'Password' : 'Password (leave blank to keep current)'}
                </label>
                <Input
                  id="user-password-input"
                  onChange={event => {
                    const value = event.currentTarget.value;
                    setDraft(current => ({ ...current, password: value }));
                  }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  type="password"
                  value={draft.password}
                />
              </div>
            ) : null}

            <div className="space-y-2 md:col-span-2">
              <div className="text-sm font-medium">Brand membership</div>
              {draft.role === 'admin' ? (
                <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-3 text-sm text-muted-foreground">
                  Admin role gets automatic access to all brands.
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-left text-sm"
                    onClick={() => setBrandPickerOpen(current => !current)}
                    type="button"
                  >
                    <span className="truncate pr-3 text-foreground">{selectedBrandSummary}</span>
                    <span className="text-xs text-muted-foreground">
                      {brandPickerOpen ? 'Close' : 'Open'}
                    </span>
                  </button>

                  {brandPickerOpen ? (
                    <div className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-3">
                      <Input
                        id="user-brand-membership-search-input"
                        onChange={event => {
                          setBrandSearchText(event.currentTarget.value);
                        }}
                        placeholder="Search brand name"
                        value={brandSearchText}
                      />
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                        <label className="inline-flex items-center gap-2">
                          <input
                            checked={allFilteredBrandsSelected}
                            disabled={filteredBrandCodes.length === 0}
                            onChange={event => {
                              const checked = event.currentTarget.checked;
                              setDraft(current => {
                                const nextCodes = new Set(current.brandCodes);
                                for (const brandCode of filteredBrandCodes) {
                                  if (checked) {
                                    nextCodes.add(brandCode);
                                  } else {
                                    nextCodes.delete(brandCode);
                                  }
                                }
                                return {
                                  ...current,
                                  brandCodes: Array.from(nextCodes)
                                };
                              });
                            }}
                            type="checkbox"
                          />
                          Select all
                        </label>
                        <span>{selectedBrandCount} selected</span>
                      </div>

                      <div className="max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-background/70">
                        {filteredBrands.length > 0 ? (
                          filteredBrands.map(brand => (
                            <label
                              className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
                              key={brand.id}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-foreground">{brand.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {brand.code}
                                </span>
                              </span>
                              <input
                                checked={selectedBrandCodeSet.has(brand.code)}
                                onChange={event => {
                                  const checked = event.currentTarget.checked;
                                  setDraft(current => {
                                    const nextCodes = new Set(current.brandCodes);
                                    if (checked) {
                                      nextCodes.add(brand.code);
                                    } else {
                                      nextCodes.delete(brand.code);
                                    }
                                    return {
                                      ...current,
                                      brandCodes: Array.from(nextCodes)
                                    };
                                  });
                                }}
                                type="checkbox"
                              />
                            </label>
                          ))
                        ) : (
                          <div className="px-3 py-3 text-sm text-muted-foreground">
                            No brands match this search.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {selectedBrandCount > 0 ? (
                    <div className="text-xs text-muted-foreground">{selectedBrandCount} selected</div>
                  ) : null}
                </div>
              )}
            </div>

            {draft.role !== 'admin' && draft.brandCodes.length > 0 ? (
              <div className="space-y-3 md:col-span-2">
                <div className="text-sm font-medium">Report permissions</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-sm">
                    <input
                      checked={draft.canCreateReports}
                      onChange={event => {
                        const checked = event.currentTarget.checked;
                        setDraft(current => ({ ...current, canCreateReports: checked }));
                      }}
                      type="checkbox"
                    />
                    Can create/edit/submit report
                  </label>
                  {draft.role !== 'content' ? (
                    <label className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-sm">
                      <input
                        checked={draft.canApproveReports}
                        onChange={event => {
                          const checked = event.currentTarget.checked;
                          setDraft(current => ({ ...current, canApproveReports: checked }));
                        }}
                        type="checkbox"
                      />
                      Can approve/reject report
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

            {modalMode === 'edit' && editingUser ? (
              <>
                <div className="mt-3 text-xs text-muted-foreground">
                  Current sign-in: {signInLabelFromMethod(inferSignInMethodFromUser(editingUser))}
                </div>
                {editingUser.isBootstrapSuperAdmin ? (
                  <div className="mt-2 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    Bootstrap Super Admin account is protected from deletion and role downgrade.
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={pendingKey === 'save'} onClick={saveUser} type="button">
                {modalMode === 'create' ? 'Create User' : 'Save Changes'}
              </Button>
            </div>
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Keep user"
        confirmLabel="Delete user"
        description={
          deleteTargetUser
            ? `This will permanently delete "${deleteTargetUser.displayName}". This action cannot be undone.`
            : ''
        }
        onCancel={() => setDeleteTargetUser(null)}
        onConfirm={() => {
          if (deleteTargetUser) {
            void deleteUser(deleteTargetUser);
          }
        }}
        open={!!deleteTargetUser}
        pending={!!deleteTargetUser && pendingKey === `delete:${deleteTargetUser.id}`}
        title={
          deleteTargetUser ? `Delete "${deleteTargetUser.displayName}"?` : 'Delete user?'
        }
      />
    </div>
  );
}
