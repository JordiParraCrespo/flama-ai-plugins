import path from 'node:path';
import {
  type BrowserContext,
  test as base,
  chromium,
  expect,
  type Route,
  type Worker,
} from '@playwright/test';

/** Where the built, unpacked extension is. */
const DIST = path.resolve(import.meta.dirname, '../dist');
/** The API origin the default build is given (`EXTENSION_PUBLIC_API_URL`). */
export const API = 'http://localhost:3001';

export const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'ada@flama.dev',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'user',
  emailVerified: true,
};
export const PASSWORD = 'correct horse battery staple';
export const TOTP = '123456';

/**
 * The API, played by the test: one account, a session that signing in and out
 * really changes, and two-factor when `twoFactor` is on. Better Auth's own
 * routes and response shapes, so the extension's real auth client runs
 * against it unchanged.
 */
export interface FakeApi {
  signedIn: boolean;
  twoFactor: boolean;
}

const session = () => ({
  session: { id: 's1', userId: USER.id, expiresAt: '2099-01-01T00:00:00.000Z' },
  user: { ...USER, name: 'Ada Lovelace' },
});

async function serve(context: BrowserContext, api: FakeApi) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });

  await context.route(`${API}/api/auth/get-session`, (route) =>
    json(route, api.signedIn ? session() : null),
  );
  await context.route(`${API}/api/auth/sign-in/email`, (route) => {
    const { email, password } = route.request().postDataJSON() as Record<string, string>;
    if (email !== USER.email || password !== PASSWORD) {
      return json(
        route,
        { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
        401,
      );
    }
    if (api.twoFactor) return json(route, { twoFactorRedirect: true });
    api.signedIn = true;
    return json(route, { redirect: false, token: 't', user: session().user });
  });
  await context.route(`${API}/api/auth/two-factor/verify-totp`, (route) => {
    const { code } = route.request().postDataJSON() as Record<string, string>;
    if (code !== TOTP) return json(route, { code: 'INVALID_CODE', message: 'Invalid code' }, 401);
    api.signedIn = true;
    return json(route, { token: 't', user: session().user });
  });
  await context.route(`${API}/api/auth/sign-out`, (route) => {
    api.signedIn = false;
    return json(route, { success: true });
  });
  await context.route(`${API}/api/v1/profile`, (route) =>
    api.signedIn
      ? json(route, {
          ...USER,
          phone: null,
          jobTitle: null,
          avatarUrl: null,
          twoFactorEnabled: api.twoFactor,
          hasPassword: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })
      : json(route, { title: 'Unauthorized', status: 401, code: 'AUTH_001' }, 401),
  );
}

/**
 * A Chromium with the extension loaded, its service worker, the extension's
 * id, and the fake API. A persistent context because that is the only kind
 * Chrome loads an extension into; `chromium` because the new headless mode is
 * the one that runs extensions.
 */
export const test = base.extend<{
  api: FakeApi;
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  signedIn: boolean;
  twoFactor: boolean;
}>({
  signedIn: [false, { option: true }],
  twoFactor: [false, { option: true }],

  api: async ({ signedIn, twoFactor }, use) => {
    await use({ signedIn, twoFactor });
  },

  context: async ({ api }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await serve(context, api);

    // A first install opens the options page (`background/index.ts`), and
    // Chrome may open it by navigating whichever tab is newest. Wait for it
    // before a test opens tabs of its own, or it lands in one of them.
    await expect
      .poll(() => context.pages().some((page) => page.url().endsWith('/options.html')), {
        timeout: 10_000,
      })
      .toBe(true);

    await use(context);
    await context.close();
  },

  worker: async ({ context }, use) => {
    const [running] = context.serviceWorkers();
    await use(running ?? (await context.waitForEvent('serviceworker')));
  },

  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
});

export { expect } from '@playwright/test';
