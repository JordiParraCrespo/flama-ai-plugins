# apps/extension Architecture — contexts that share nothing, one runtime between them

`apps/extension` is the consumer product as a Chrome extension, and the base
the next extension starts from. It is a frontend app like `apps/web`:
entrypoints compose, features contain, and logic lives in the packages below.
The one difference shapes everything else: Chrome runs it as **several
programs at once**. They share no memory, do not have the same APIs, and are
started and stopped by the browser rather than by us.

This document is the source of truth for the app. `.dependency-cruiser.cjs`,
`src/__tests__/boundaries.spec.ts`, `scripts/check-frontend-structure.mjs` and
`.agents/rules/frontend-architecture.md` enforce what is described here. When
they disagree, fix the code or update both together. The tier-wide model is
[`packages/frontend/ARCHITECTURE.md`](../../packages/frontend/ARCHITECTURE.md).

## The contexts

```
  ┌───────────────── chrome.storage ─────────────────┐   ┌──── cookie jar ────┐
  │  the query cache · kernel keys · your items       │   │  the API session   │
  └────────▲──────────────────────────────▲──────────┘   └─────────▲──────────┘
           │                              │                         │
  ┌─ extension pages ────────────────┐    │                         │
  │  popup · side panel · options    │────┼─────────────────────────┘
  │  React, the kernel, the session  │◄───┼──── session/changed ────► every other page
  └──────────────▲───────────────────┘    │
                 │ runtime messages (src/runtime/protocol.ts)
  ┌──────────────▼─── service worker ─┐   │      ┌──── content script (yours) ────┐
  │  src/background/                   │───┘      │  src/content/ — in one tab, on  │
  │  no DOM, no React, no session      │◄────────►│  demand; none ships in the base │
  └────────────────────────────────────┘ inject,  └────────────────────────────────┘
                                         tab messages
```

| Context | Lives | Has | Never has |
| --- | --- | --- | --- |
| **Pages** (popup, side panel, options) | while open; the popup only until it loses focus | DOM, React, the kernel, the session cookie | a page's DOM |
| **Service worker** | started for an event, stopped after ~30 idle seconds | `chrome.*`, `fetch` | DOM, React, memory between wakes |
| **Content script** (when you add one) | inside one tab, from injection until the tab navigates | that tab's DOM (an isolated world: none of its JavaScript) | most of `chrome.*`, the extension's state |

Three consequences, each a rule:

1. **State that must last is in `chrome.storage`, never in memory.** The
   worker forgets everything when Chrome stops it. Every persisted value is an
   item declared once with `defineItem` (`src/runtime/storage.ts`) with a Zod
   schema and a fallback. A value that no longer parses reads as the fallback,
   so an older build's data never bricks a newer one.
2. **Contexts talk through one typed table.** `src/runtime/protocol.ts` names
   every message, what it carries and what it answers; `send`, `sendToTab`,
   `broadcast` and `listen` accept nothing else. A handler's error crosses the
   boundary as a `MessageError` with its code, and only this extension's own
   contexts get an answer.
3. **Work that must outlive a page runs in the worker.** The popup closes the
   moment it loses focus, so anything slower than a click is a message to the
   worker, which does it.

## The layers

```
  src/entrypoints/        popup.tsx sidepanel.tsx options.tsx — compose, < 120 lines
      │
      ▼
  src/features/<module>/  screens sections dialogs forms components hooks lib __tests__
      │                   auth · profile · user-settings
      ├────────► @flama/frontend-web         the web kit: auth chrome, theme, i18n
      │                 └──► @flama/design-system-web
      ├────────► @flama/frontend-consumer    profile, organizations
      ├────────► @flama/frontend-core        auth, session, FlamaApp
      ▼
  src/lib/                flama.ts auth-client.ts nav.ts query.ts — configuration only
      │
      ▼
  src/runtime/            protocol · messaging · storage · tabs · dev-reload
      ▲          ▲          the floor: the only code that calls chrome.*, no React
      │          │
  src/background/  src/content/      the worker and a content script, on the runtime alone
```

What `pnpm arch` holds, beyond the rules every frontend app shares
(`features-are-islands`, `routes-compose`, `forms-and-components-stay-pure`,
`one-product-per-app`, `kit-through-its-entry`):

| Rule | Why |
| --- | --- |
| `runtime-is-the-floor` | The runtime imports nothing above it and no React, so the worker and a content script can build on it. |
| `worker-holds-no-pages` | The worker has no DOM. A page, a feature or the kernel in its bundle is code that cannot run there. |
| `content-script-stays-small` | A content script is injected into somebody else's page: the runtime and its own modules, nothing heavier. |
| `pages-ask-the-worker` | A page never imports the worker's modules — it sends it a message. |

And what `pnpm test` holds, because `chrome` is a global that no import graph
shows: `boundaries.spec.ts` fails when `chrome.*` is called outside
`src/runtime/`, `src/background/` or `src/content/`. A feature that wants a
Chrome API gets a function in the runtime, and is testable without a browser.

## The session — the base's one feature

The session is the API's httpOnly cookie: the web app's, not a token of the
extension's. Chrome treats a request to a host in `host_permissions` as
same-site, so the cookie is set and sent like a first-party one. The API admits
the extension's origin (`chrome-extension://<id>`) through `EXTENSION_IDS`.
Nothing secret is ever in `chrome.storage`.

- **Signing in** is `features/auth`: `SignInScreen` (password, then the web
  kit's two-factor step), inside a `SessionGate` that shows it to a signed-out
  person and the page to a signed-in one. A failed session lookup is an error
  with a retry, never "signed out".
- **The authenticated request** is `features/profile`: `AccountOverview` reads
  `GET /api/v1/profile` through `useMyProfile`, with the cookie the sign-in set.
  That query is kept out of the persisted cache: a profile is not a thing to
  leave in storage, and an entity restored from JSON would have lost its
  getters.
- **Every page agreeing.** Every page shares the browser's cookie jar, so a
  sign-in in one is a sign-in in all, but each page has already concluded
  something from the old cookie. So signing in or out broadcasts
  `session/changed`, and `useSessionSync` in each other page resets its session
  query and asks again. Two details, each a bug the Playwright suite caught:
  - The broadcast goes in the hook's options (`useLogin({ onSuccess })`), never
    in `mutate(…, { onSuccess })`. The sign-in unmounts the screen that started
    it, and TanStack Query drops a `mutate` callback whose component is gone.
  - The session query is reset, not invalidated, so the gate holds its spinner
    until the kernel has also dropped the previous user's cache. Otherwise a
    page mounts in between and subscribes to a query that is then removed
    under it.

## The surfaces

- **Popup** — one look. Signed out it is the sign-in; signed in, the account
  and the way onward (`AccountActions`, the destinations in `lib/nav.ts`).
- **Side panel** — the extension's room to work in, beside any tab for as long
  as the person wants it. In the base it shows the account; a real
  extension's main screen goes here.
- **Options page** — account, appearance, the shortcut, privacy. A first install
  opens it: the place to sign in, and to read what the extension can reach
  before it is ever used.

Every page renders through `mount()` (`src/providers/mount.tsx`). It brings the
theme, the persisted query cache, the kernel, the one `Toaster`, and the wait
for the reader's catalog. Each page is its own document with its own React
root and its own `FlamaApp`.

## Privacy, by construction

- Host access to the API's origin and nothing else: the install prompt asks for
  access to no website, and no page the person visits is read.
- No `content_scripts`, no `externally_connectable`, no
  `web_accessible_resources`: no web page can message the extension or probe it.
- `manifest.spec.ts` holds the permission list. Adding one is a decision with
  a reason in the review, because Chrome disables the extension for every
  existing user until they accept the new prompt.

## Cookbook

### Add a message

1. Add it to `Protocol` in `src/runtime/protocol.ts`: `'<owner>/<verb>':
   { request; response }`, the owner being whoever answers.
2. Answer it in that context's `listen({...})`. The worker's go in
   `src/background/index.ts`, registered at the top level.
3. Call it with `send` (to the worker), `sendToTab` (to a content script) or
   `broadcast` (to every other page). A page wraps a call in a `useMutation`
   in its feature's `hooks/`, its follow-up in the hook's options.
4. A spec: a handler is a function, so test it directly with the fake
   `chrome` (`src/runtime/__tests__/fake-chrome.ts`).

### Keep something in `chrome.storage`

Declare it once, in a `src/runtime/items.ts` you create, with `defineItem({
area, key, schema, fallback })`, and name its one writer in the comment. Read it
in a page with `useSyncExternalStore(storeOf(item).subscribe,
storeOf(item).getSnapshot)` in a feature's `hooks/`; write it from its writer
with `item.update`, which keeps one context's writes in order. Pick the area for
what it is: `local` for this browser, `session` for until the browser closes,
`sync` for small settings that should follow the person to another machine.

### Read or change the pages a person visits

1. Write `src/content/index.ts`. `scripts/build.mjs` builds it as a classic
   `content.js` whenever it exists.
2. Inject it into the tab the person invoked the extension on (the toolbar, a
   context menu, a shortcut) with `chrome.scripting.executeScript({ target:
   { tabId }, files: ['content.js'] })`. Add a function for it to
   `runtime/tabs.ts`, and `activeTab` + `scripting` to the manifest. Only that
   tab is granted, and only for that moment.
3. Answer the worker with `listen` in the content script, and ask it with
   `sendToTab`. Draw any UI in a closed shadow root: the page's CSS and scripts
   must not reach it.

### Add a feature to a page

`node scripts/scaffold-feature.mjs --app extension --module <module>` builds the
kind directories, a screen and the section it composes. Name the feature after
a module of the kernel or the consumer package; if the module does not exist,
add it to the product package first. Mount it from an entrypoint, which stays
under 120 lines. A feature that touches Chrome does it through `src/runtime/`.

### Ask for a permission

Add it in `manifest.config.ts`, update `manifest.spec.ts` in the same diff, and
the privacy text in `extension.options.privacyDescription`. Prefer an
`optional_permissions` entry requested at the moment it is needed
(`chrome.permissions.request` inside a click) over a permission every install
asks for.
