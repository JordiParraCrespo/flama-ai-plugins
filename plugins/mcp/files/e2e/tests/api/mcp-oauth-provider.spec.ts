import { expect, test } from '@playwright/test';
import { newContext } from '../../support/auth';

/**
 * The API as an OAuth 2.1 provider for MCP clients: what a client reads
 * before it registers itself, and what it is refused without a grant.
 */
test.describe('OAuth provider metadata for MCP clients', () => {
  test('discovery advertises the endpoints and this deployment’s scopes', async () => {
    const api = await newContext();

    const response = await api.get('/api/auth/.well-known/oauth-authorization-server', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const metadata = await response.json();
    expect(metadata.authorization_endpoint).toContain('/api/auth/mcp/authorize');
    expect(metadata.token_endpoint).toContain('/api/auth/mcp/token');
    // The point of publishing `metadata.scopes_supported` is that a client can
    // see the deployment's own permission catalog, not just the OIDC standards.
    expect(Array.isArray(metadata.scopes_supported)).toBe(true);
    expect(metadata.scopes_supported).toContain('openid');
    expect(
      metadata.scopes_supported.some((scope: string) => scope.includes(':')),
      'the deployment catalog (e.g. profile:read) should be advertised, not only OIDC scopes',
    ).toBe(true);
  });

  test('the token endpoint refuses an unauthenticated grant', async () => {
    const api = await newContext();

    const response = await api.post('/api/auth/mcp/token', {
      form: {
        grant_type: 'authorization_code',
        code: 'made-up',
        client_id: 'nobody',
      },
      failOnStatusCode: false,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });
});
