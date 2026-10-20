# @flama/extension

A Manifest V3 Chrome extension over the consumer product, built as the base
the next extension starts from. Its one feature is the one every extension
needs first: **signing in**. It covers email and password with two-factor, an
authenticated request to the API, signing out, and every open page agreeing on
who is signed in. Whatever the extension is for, it goes on top of that.

| Surface | What it shows | Where |
| --- | --- | --- |
| **Popup** | The toolbar button (`Alt+Shift+F`): sign-in, or the account and the way onward | `src/entrypoints/popup.tsx` |
| **Side panel** | A room beside any tab: sign-in, or the account. A real extension's main screen goes here | `src/entrypoints/sidepanel.tsx` |
| **Options page** | Account, appearance, the shortcut, and what the extension can reach; opened on first install | `src/entrypoints/options.tsx` |
| **Service worker** | Opens the options page on install; where work with no page to run in goes | `src/background/` |

It signs in with the same Better Auth session the web app uses, the API's
httpOnly cookie. It reaches the API through the same kernel
(`@flama/frontend-core`) and product package (`@flama/frontend-consumer`). The
screens are built from `@flama/design-system-web` and the web kit, so the
extension looks like the product because it is the product.

## Stack

- Vite, building the pages and the service worker into one `dist/`, and a
  content script too once you add one (`vite.config.ts` says why each is its
  own bundle), driven by `scripts/build.mjs`
- The manifest written as typed code (`manifest.config.ts`), generated at
  build time, its permission list held by a test
- React 19 with the React Compiler, Tailwind v4, `@flama/design-system-web`
- TanStack Query, persisted to `chrome.storage.local`, so the popup opens on
  the last answers instead of a spinner
- react-i18next over `@flama/translations` (`extension.*`). Chrome's own
  strings (`_locales/`) are written from the same catalog
- Typed messaging and typed, validated storage over `chrome.*`
  (`src/runtime/`), the only code that calls Chrome
- Vitest against an in-memory `chrome`; Playwright against a real Chromium

## Run it

Configuration comes from the **root `.env`**. Only `EXTENSION_PUBLIC_*` values
reach the bundle.

```bash
pnpm docker:dev                          # Postgres + Redis
pnpm --filter @flama/api dev             # the API the extension signs in to
pnpm --filter @flama/extension keygen    # once: pins the extension id (see below)
pnpm --filter @flama/extension dev       # build on save, into apps/extension/dist
```

Then open `chrome://extensions`, switch on **Developer mode**, choose **Load
unpacked** and pick `apps/extension/dist`. Do that once: `dev` runs a reload
server, and the development build's service worker reloads the whole extension
on every rebuild.

### Signing in from the extension

The API admits an extension by its origin, `chrome-extension://<id>`. An
unpacked extension's id comes from its folder path, which is different on every
machine. `keygen` prints a public key that fixes it, and the id it produces:

```bash
pnpm --filter @flama/extension keygen
# EXTENSION_PUBLIC_KEY=MIIBIjANBgkqh…   → the manifest's `key`, which pins the id
# EXTENSION_IDS=<32 letters, a–p>       → the API's trusted origins
```

Put both lines in the root `.env`, restart the API, rebuild the extension.
`EXTENSION_IDS` takes a comma-separated list: add the Web Store's id when the
extension is published.

## Every command

```bash
pnpm --filter @flama/extension dev      # watch build + reload server
pnpm --filter @flama/extension build    # tsc -b, then the production build
pnpm --filter @flama/extension test     # Vitest + the build tools' node tests
pnpm --filter @flama/extension e2e      # Playwright: the built extension in Chromium
pnpm --filter @flama/extension zip      # release/flama-extension-<version>.zip
pnpm --filter @flama/extension lint
pnpm --filter @flama/extension lint:design
pnpm --filter @flama/extension arch     # dependency-cruiser
```

`e2e` loads `dist/` into Chromium (`pnpm --filter @flama/extension exec
playwright install chromium` once) and plays the API itself, so it needs
nothing else running. It signs in with a password, with two-factor and with a
wrong password, and checks that a sign-in in the popup reaches an open side
panel and that a sign-out there reaches back.

## Building your extension on it

1. Name it: `extension.chrome` in `@flama/translations` (the name, the
   description), the icons in `public/icons/`, `version` in `package.json`.
2. Ask for what it needs and no more, in `manifest.config.ts`, with the test
   beside it updated. Read a page with `activeTab` + `scripting` after the
   person invokes the extension, not host access to every site. Prefer an
   `optional_permissions` entry requested inside the click that needs it.
3. Put its screens where the account pane is (`features/profile/sections/account-overview.tsx`
   in the popup and the side panel), as features named after a module of the
   kernel or the consumer package (`node scripts/scaffold-feature.mjs --app extension --module <module>`).
4. Give work with no page (a menu, a shortcut, an alarm) to the service worker,
   asked by message. Read or change pages with a content script: write
   `src/content/index.ts` and it is built as `content.js`.

[`ARCHITECTURE.md`](./ARCHITECTURE.md) has each of these as a recipe.

## Publishing

1. Bump `version` in `package.json`. Chrome refuses an update whose version is
   not higher.
2. `pnpm --filter @flama/extension build && pnpm --filter @flama/extension zip`.
   `zip` refuses a development build, drops the source maps and the `key`
   (the store assigns its own), and writes a reproducible archive: the same
   `dist/` always zips to the same bytes.
3. Upload `release/flama-extension-<version>.zip` in the Chrome Web Store
   developer dashboard. Point `EXTENSION_PUBLIC_API_URL` at production before
   building: it is also the manifest's host permission.
4. Add the published id to the API's `EXTENSION_IDS`.

The listing's name and description come from `extension.chrome` in
`@flama/translations`, per locale. The options page's privacy section is the
permission list in words; keep the two in step (`manifest.spec.ts` fails when
the list changes).

## Layout

```
manifest.config.ts       the manifest, as typed code
popup.html sidepanel.html options.html
public/                  icons, theme-init.js (the theme before first paint)
scripts/                 build, store-zip, keygen, the reload server, the zip writer
src/
├── entrypoints/         popup.tsx sidepanel.tsx options.tsx — compose, never contain
├── background/          the service worker
├── runtime/             the only code that calls chrome.*: protocol, messaging,
│                        storage, tabs, dev reload
├── features/<module>/   auth, profile, user-settings — kind directories
├── lib/                 flama.ts, auth-client.ts, nav.ts, query.ts
├── providers/           the root every page renders in
└── styles/globals.css
playwright/              the built extension, in Chromium
```

## Not in the box

- **Social sign-in.** A provider's redirect cannot land back in a popup that
  closed when it lost focus. Use `chrome.identity.launchWebAuthFlow` from the
  service worker (add the `identity` permission), and add
  `https://<id>.chromiumapp.org/` to the provider's redirect URLs. Then pass
  `socialProviders` in `src/lib/flama.ts` as the web app does.
- **Firefox and Safari.** The code is plain MV3, but nothing here is tested
  there.
