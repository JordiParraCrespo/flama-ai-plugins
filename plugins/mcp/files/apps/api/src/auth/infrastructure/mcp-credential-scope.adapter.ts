import { AppError } from '@flama/backend-core';
import { parseScopeString, toResourceScope } from '@flama/shared';
import { Inject, Injectable, Logger, type Provider } from '@nestjs/common';
import { ApiTokenErrors } from '../../api-tokens/domain/api-token.errors';
import {
  hashApiTokenSecret,
  isApiTokenSecret,
} from '../../api-tokens/domain/api-token-secret.factory';
import type { UserRepositoryPort } from '../../users/database/user.repository.port';
import { USER_REPOSITORY } from '../../users/user.di-tokens';
import type { CredentialScopePort } from '../application/credential-scope.port';
import { CredentialScopeResolver } from '../application/credential-scope.resolver';
import { CREDENTIAL_SCOPE } from '../auth.di-tokens';
import type { CredentialOwner, ScopeContext, ScopedRequest } from '../domain/scope-context.types';
import { auth } from './better-auth.config';
import { betterAuthHeaders } from './better-auth.util';

/** Memoizes resolution so the guards can each ask without a second lookup. */
const RESOLUTION = Symbol('flama.mcpCredentialResolution');

interface WithResolution {
  [RESOLUTION]?: Promise<ScopeContext | null>;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * `CREDENTIAL_SCOPE` once the API is an OAuth 2.1 provider for MCP clients:
 * the starter's resolver, with OAuth grants in front of it.
 *
 * A bearer credential that is not an API token is first asked of Better
 * Auth's MCP plugin (`getMcpSession`), and a grant it recognises becomes a
 * scope context carrying the scopes the user approved on the consent screen.
 * Everything else — a session, an API token, no credential at all — goes to
 * {@link CredentialScopeResolver} unchanged.
 */
@Injectable()
export class McpCredentialScopeAdapter implements CredentialScopePort {
  private readonly logger = new Logger(McpCredentialScopeAdapter.name);

  constructor(
    private readonly credentials: CredentialScopeResolver,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepositoryPort,
  ) {}

  resolve(request: ScopedRequest): Promise<ScopeContext | null> {
    const carrier = request as ScopedRequest & WithResolution;
    carrier[RESOLUTION] ??= this.doResolve(request);
    return carrier[RESOLUTION];
  }

  private async doResolve(request: ScopedRequest): Promise<ScopeContext | null> {
    const bearer = bearerOf(request);
    if (bearer && !isApiTokenSecret(bearer)) {
      const grant = await this.resolveGrant(request);
      if (grant) return grant;
    }
    return this.credentials.resolve(request);
  }

  /** The OAuth grant these headers carry, as a scope context, or `null`. */
  private async resolveGrant(request: ScopedRequest): Promise<ScopeContext | null> {
    const session = await auth.api
      .getMcpSession({ headers: betterAuthHeaders(request.headers) })
      .catch((error: unknown) => {
        this.logger.debug(`OAuth token verification failed: ${describe(error)}`);
        return null;
      });
    if (!session?.userId) return null;

    return {
      kind: 'oauth',
      // The grant has no id of its own, so derive a stable one by digesting the
      // access token — never the token itself, which would put a live secret
      // into cache keys and logs.
      credentialId: `oauth:${hashApiTokenSecret(session.accessToken).slice(0, 32)}`,
      userId: session.userId,
      owner: await this.loadOwner(session.userId),
      scopes: parseScopeString(session.scopes).scopes,
      // OAuth grants are not organization-restricted: the consent screen grants
      // permissions, and the user's own memberships bound their reach.
      resourceScope: toResourceScope(null),
      expiresAt: session.accessTokenExpiresAt ? new Date(session.accessTokenExpiresAt) : null,
    };
  }

  /**
   * The grant's owner, as they exist right now: a missing or deactivated owner
   * invalidates the grant, with the same opaque error as an unknown token.
   */
  private async loadOwner(userId: string): Promise<CredentialOwner> {
    const found = await this.users.findOneById(userId);
    if (found.isNone()) throw new AppError(ApiTokenErrors.INVALID_CREDENTIAL);

    const owner = found.unwrap();
    if (!owner.isActive) throw new AppError(ApiTokenErrors.INVALID_CREDENTIAL);

    return {
      id: owner.id,
      email: owner.email,
      firstName: owner.firstName,
      lastName: owner.lastName,
      role: owner.role,
      isActive: owner.isActive,
      emailVerified: owner.emailVerified,
    };
  }
}

/** An `Authorization: Bearer` value, unless an API key header takes precedence. */
function bearerOf(request: ScopedRequest): string | null {
  if (request.headers['x-api-key']) return null;
  const [scheme, ...rest] = (request.headers.authorization ?? '').split(' ');
  if (scheme.toLowerCase() !== 'bearer') return null;
  return rest.join(' ').trim() || null;
}

/**
 * What `AuthModule` registers: the starter's resolver as a class this adapter
 * wraps, and this adapter as `CREDENTIAL_SCOPE`. Registered after the
 * starter's own binding of that token, and Nest keeps the last binding.
 */
export const MCP_CREDENTIAL_SCOPE_PROVIDERS: Provider[] = [
  CredentialScopeResolver,
  { provide: CREDENTIAL_SCOPE, useClass: McpCredentialScopeAdapter },
];
