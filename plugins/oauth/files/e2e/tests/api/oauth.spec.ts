import { expect, test } from '@playwright/test';
import { newContext } from '../../support/auth';

/**
 * Google and GitHub sign-in, as `GET /health/capabilities` reports them: a
 * missing key disables a provider rather than breaking the app, and the
 * capability read is how a client finds out.
 */
test('capabilities reports whether each provider is configured', async () => {
  const api = await newContext();

  const response = await api.get('/api/v1/health/capabilities', {
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(typeof body.google_oauth).toBe('boolean');
  expect(typeof body.github_oauth).toBe('boolean');
});
