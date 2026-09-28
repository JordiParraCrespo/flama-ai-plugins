import type { AdminCreateUserDto, AdminUpdateUserDto } from '@flama/shared';
import { inject, injectable } from 'inversify';
import { TOKENS } from '../../di/tokens';
import type { AdminUsersListParams, AdminUsersRepository } from './admin-users.repository';

@injectable()
export class AdminUsersService {
  constructor(
    @inject(TOKENS.AdminUsersRepository)
    private readonly repository: AdminUsersRepository,
  ) {}

  findAll(params?: AdminUsersListParams) {
    return this.repository.findAll(params);
  }
  findById(id: string) {
    return this.repository.findById(id);
  }
  create(dto: AdminCreateUserDto) {
    return this.repository.create(dto);
  }
  update(id: string, dto: AdminUpdateUserDto) {
    return this.repository.update(id, dto);
  }
  setPlatformRole(id: string, role: string | string[]) {
    return this.repository.setPlatformRole(id, role);
  }
  ban(id: string, banReason?: string) {
    return this.repository.ban(id, banReason);
  }
  unban(id: string) {
    return this.repository.unban(id);
  }
  remove(id: string) {
    return this.repository.remove(id);
  }
  sessions(id: string) {
    return this.repository.sessions(id);
  }
  revokeSession(id: string, sessionId: string) {
    return this.repository.revokeSession(id, sessionId);
  }
  revokeAllSessions(id: string) {
    return this.repository.revokeAllSessions(id);
  }
  setPassword(id: string, newPassword: string) {
    return this.repository.setPassword(id, newPassword);
  }
}
