import { expect, PASSWORD, TOTP, test, USER } from './fixtures';

/**
 * The extension in Chrome, signing in against the API. What breaks if these
 * fail: Chrome refuses the manifest, or the worker throws on start — and the
 * extension is greyed out for everyone who updates; sign-in or its two-factor
 * step stops reaching the API; a sign-in in one page leaves another page
 * believing nobody is signed in.
 */

test('Chrome accepts the manifest, and it asks for no website', async ({ worker }) => {
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.name).toBe('Flama');
  expect(manifest.permissions).toEqual(['sidePanel', 'storage']);
  expect(manifest.host_permissions).toEqual(['http://localhost:3001/*']);
});

test('a first install opens the options page, which asks a signed-out person to sign in', async ({
  context,
  extensionId,
}) => {
  const [options] = context.pages().filter((page) => page.url().endsWith('/options.html'));

  expect(options.url()).toBe(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByRole('heading', { name: 'Sign in to Flama' })).toBeVisible();
  await expect(options.getByText('reads none of the pages you visit')).toBeVisible();
});

test('signing in from the popup shows the account the API returns', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await popup.getByLabel('Email', { exact: true }).fill(USER.email);
  await popup.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await popup.getByRole('button', { name: 'Sign in' }).click();

  await expect(popup.getByText('Ada Lovelace')).toBeVisible();
  await expect(popup.getByText(USER.email)).toBeVisible();
  await expect(popup.getByText('Connected to localhost:3001')).toBeVisible();
});

test('a wrong password stays on the sign-in screen and says so', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await popup.getByLabel('Email', { exact: true }).fill(USER.email);
  await popup.getByLabel('Password', { exact: true }).fill('not it');
  await popup.getByRole('button', { name: 'Sign in' }).click();

  await expect(popup.getByRole('alert')).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'Sign in to Flama' })).toBeVisible();
});

test.describe('with two-factor on', () => {
  test.use({ twoFactor: true });

  test('the password step asks for a code, and the code signs in', async ({
    context,
    extensionId,
  }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await popup.getByLabel('Email', { exact: true }).fill(USER.email);
    await popup.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await popup.getByRole('button', { name: 'Sign in' }).click();

    const code = popup.getByRole('textbox').first();
    await expect(code).toBeVisible();
    await code.fill(TOTP);
    await popup.getByRole('button', { name: /verify/i }).click();

    await expect(popup.getByText('Ada Lovelace')).toBeVisible();
  });
});

test('a sign-in in the popup reaches an open side panel, and a sign-out there reaches back', async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'Sign in to Flama' })).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByLabel('Email', { exact: true }).fill(USER.email);
  await popup.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await popup.getByRole('button', { name: 'Sign in' }).click();
  await expect(popup.getByText('Ada Lovelace')).toBeVisible();

  // No reload: `session/changed` told the panel to look again.
  await expect(panel.getByText('Ada Lovelace')).toBeVisible();

  await panel.getByRole('button', { name: 'Account' }).click();
  await panel.getByRole('menuitem', { name: 'Sign out' }).click();

  await expect(panel.getByRole('heading', { name: 'Sign in to Flama' })).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'Sign in to Flama' })).toBeVisible();
});
