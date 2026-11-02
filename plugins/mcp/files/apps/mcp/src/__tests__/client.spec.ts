import { describe, expect, it, vi } from 'vitest';
import { FlamaApiError, FlamaClient } from '../client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });

const clientWith = (fetchImpl: typeof fetch) =>
  new FlamaClient({
    apiUrl: 'https://api.example.com',
    token: 'flama_pat_test',
    fetchImpl,
  });

const failWith = (status: number, body: unknown) =>
  clientWith(vi.fn().mockResolvedValue(json(status, body)))
    .get('/users')
    .catch((error) => error as FlamaApiError);

describe('problem details', () => {
  it('reports the occurrence detail and the catalog code', async () => {
    const error = await failWith(404, {
      type: 'https://flama.dev/errors#user_001',
      title: 'User not found',
      status: 404,
      detail: 'No user with id 42',
      code: 'USER_001',
      correlationId: 'req-7',
    });

    expect(error.status).toBe(404);
    expect(error.code).toBe('USER_001');
    expect(error.message).toBe('No user with id 42');
    expect(error.correlationId).toBe('req-7');
  });

  it('falls back to the problem title when there is no detail', async () => {
    const error = await failWith(403, {
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
    });

    expect(error.message).toBe('Forbidden');
    expect(error.isPermissionError).toBe(true);
  });

  it('names the rejected fields so a tool can fix its arguments', async () => {
    const error = await failWith(400, {
      title: 'Validation failed',
      status: 400,
      detail: 'The request body did not match the expected schema.',
      code: 'VALIDATION_FAILED',
      invalidParams: [{ name: 'scopes.0', reason: 'Invalid scope' }],
    });

    expect(error.message).toContain('scopes.0: Invalid scope');
    expect(error.invalidParams).toEqual([{ name: 'scopes.0', reason: 'Invalid scope' }]);
  });

  it('still understands a deployment that answers with the legacy body', async () => {
    const error = await failWith(409, {
      code: 'TOKEN_009',
      message: 'Token limit reached',
    });

    expect(error.code).toBe('TOKEN_009');
    expect(error.message).toBe('Token limit reached');
  });

  it('survives a proxy answering with something that is not JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const error = (await clientWith(fetchImpl)
      .get('/users')
      .catch((e) => e)) as FlamaApiError;

    expect(error.status).toBe(502);
    expect(error.message).toContain('<html>502</html>');
  });
});

describe('writes', () => {
  it('sends the headers a write passes beside its body, such as an idempotency key', async () => {
    // A create that is retried after a lost answer must find the first one,
    // which the API can only do if the key reaches it.
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    await clientWith(fetchImpl).post('/things', { name: 'a' }, { 'idempotency-key': 'k-1' });

    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('k-1');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer flama_pat_test');
  });

  it('carries a delete’s query, so a delete can say what it accepts losing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await clientWith(fetchImpl).delete('/things/1', { force: true, reason: undefined });

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.com/api/v1/things/1?force=true');
  });
});
