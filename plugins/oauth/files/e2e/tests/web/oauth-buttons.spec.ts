import { expect, test } from '@playwright/test';
import { newContext } from '../../support/auth';

/**
 * The login screen draws a button for each provider this deployment has
 * configured, and no other. Most stacks configure none, and then the screen
 * has no social section at all.
 */
test('a button for each configured provider, and one that works', async ({ page }) => {
  const api = await newContext();
  const capabilities = await (
    await api.get('/api/v1/health/capabilities', { failOnStatusCode: false })
  ).json();
  const configured = [
    ['Google', capabilities.google_oauth],
    ['GitHub', capabilities.github_oauth],
  ] as const;

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  for (const [name, on] of configured) {
    const button = page.getByRole('button', { name: `Continue with ${name}` });
    if (on) await expect(button).toBeEnabled();
    else await expect(button).toHaveCount(0);
  }
});
