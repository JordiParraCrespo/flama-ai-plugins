/**
 * Everything one part of the extension may say to another, in one table.
 *
 * Chrome runs this extension as several programs that share no memory — the
 * service worker and each open page (popup, side panel, options) — and
 * `chrome.runtime.sendMessage` carries `any` between them. This table is the
 * type that carries instead: a message name, what it takes and what it
 * answers. `send`, `sendToTab` and `listen` in `messaging.ts` accept nothing
 * that is not in it, so a renamed or reshaped message is a compile error at
 * every end at once.
 *
 * Names are `<owner>/<verb>`, the owner being whoever answers. A new message
 * is a row here and a handler in the context that answers it (the worker's are
 * in `src/background/index.ts`); see ARCHITECTURE.md.
 */
export interface Protocol {
  /**
   * A page → every other page: someone signed in or out. Each open page drops
   * what it knew about the session, so a sign-in in the popup is the side
   * panel's sign-in too.
   */
  'session/changed': { request: undefined; response: undefined };
}

export type MessageType = keyof Protocol;
export type RequestOf<K extends MessageType> = Protocol[K]['request'];
export type ResponseOf<K extends MessageType> = Protocol[K]['response'];
