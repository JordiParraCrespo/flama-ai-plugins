import { heyApiSdk } from '@flama/api-client';
import { AppError, MapApiError } from '@flama/frontend-core';
import type { AdminCreateUserDto, AdminUpdateUserDto } from '@flama/shared';
import { injectable } from 'inversify';
import { AdminSessionEntity, AdminUserEntity } from './admin-user.entity';
import { AdminUsersErrors } from './admin-users.errors';

export interface AdminUsersListParams {
  search?: string;
  searchField?: 'email' | 'name';
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

/** A user as `/v1/admin/users` answers with it. */
interface AdminUserData {
  id: string;
  email: string;
  name: string;
  role: string | null;
  emailVerified: boolean;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
}

/** A session as `/v1/admin/users/:id/sessions` answers with it. */
interface AdminSessionData {
  id: string;
  userId: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

function toUser(data: AdminUserData): AdminUserEntity {
  return new AdminUserEntity(
    data.id,
    data.email,
    data.name,
    data.role,
    data.emailVerified,
    data.banned,
    data.banReason,
    data.banExpires ? new Date(data.banExpires) : null,
    new Date(data.createdAt),
  );
}

function toSession(data: AdminSessionData): AdminSessionEntity {
  return new AdminSessionEntity(
    data.id,
    data.userId,
    new Date(data.expiresAt),
    data.ipAddress,
    data.userAgent,
    new Date(data.createdAt),
  );
}

/**
 * The admin API through the generated SDK. Every call throws on a non-2xx
 * (`throwOnError`), so `@MapApiError` sees the server's problem document.
 */
@injectable()
export class AdminUsersRepository {
  @MapApiError(AdminUsersErrors.FETCH_LIST_FAILED)
  async findAll(params: AdminUsersListParams = {}) {
    const { data } = await heyApiSdk.listUsers({
      query: {
        searchValue: params.search,
        searchField: params.searchField,
        limit: params.limit,
        offset: params.offset,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
      },
      throwOnError: true,
    });
    if (!data) throw new AppError(AdminUsersErrors.FETCH_LIST_FAILED);
    return {
      data: data.users.map(toUser),
      total: data.total,
      limit: data.limit,
      offset: data.offset,
    };
  }

  @MapApiError(AdminUsersErrors.FETCH_FAILED)
  async findById(id: string): Promise<AdminUserEntity> {
    const { data } = await heyApiSdk.getUser({ path: { id }, throwOnError: true });
    return toUser(data);
  }

  @MapApiError(AdminUsersErrors.CREATE_FAILED)
  async create(dto: AdminCreateUserDto): Promise<AdminUserEntity> {
    const { data } = await heyApiSdk.createUser({ body: dto, throwOnError: true });
    return toUser(data);
  }

  @MapApiError(AdminUsersErrors.UPDATE_FAILED)
  async update(id: string, dto: AdminUpdateUserDto): Promise<AdminUserEntity> {
    const { data } = await heyApiSdk.updateUser({ path: { id }, body: dto, throwOnError: true });
    return toUser(data);
  }

  @MapApiError(AdminUsersErrors.ACTION_FAILED)
  async setPlatformRole(id: string, role: string | string[]): Promise<AdminUserEntity> {
    const { data } = await heyApiSdk.setUserRole({
      path: { id },
      body: { role },
      throwOnError: true,
    });
    return toUser(data);
  }

  @MapApiError(AdminUsersErrors.ACTION_FAILED)
  async ban(id: string, banReason?: string): Promise<AdminUserEntity> {
    const { data } = await heyApiSdk.banUser({
      path: { id },
      body: { banReason },
      throwOnError: true,
    });
    return toUser(data);
  }

  @MapApiError(AdminUsersErrors.ACTION_FAILED)
  async unban(id: string): Promise<AdminUserEntity> {
    const { data } = await heyApiSdk.unbanUser({ path: { id }, throwOnError: true });
    return toUser(data);
  }

  @MapApiError(AdminUsersErrors.ACTION_FAILED)
  async remove(id: string): Promise<void> {
    await heyApiSdk.removeUser({ path: { id }, throwOnError: true });
  }

  @MapApiError(AdminUsersErrors.ACTION_FAILED)
  async sessions(id: string): Promise<AdminSessionEntity[]> {
    const { data } = await heyApiSdk.listUserSessions({ path: { id }, throwOnError: true });
    return data.map(toSession);
  }

  @MapApiError(AdminUsersErrors.ACTION_FAILED)
  async revokeSession(id: string, sessionId: string): Promise<void> {
    await heyApiSdk.revokeUserSession({ path: { id }, body: { sessionId }, throwOnError: true });
  }

  @MapApiError(AdminUsersErrors.ACTION_FAILED)
  async revokeAllSessions(id: string): Promise<void> {
    await heyApiSdk.revokeUserSessions({ path: { id }, throwOnError: true });
  }

  @MapApiError(AdminUsersErrors.ACTION_FAILED)
  async setPassword(id: string, newPassword: string): Promise<void> {
    await heyApiSdk.setUserPassword({ path: { id }, body: { newPassword }, throwOnError: true });
  }
}
