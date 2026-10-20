import { connectDevReload } from '@/runtime/dev-reload';
import { openOptions } from '@/runtime/tabs';

/**
 * The service worker: the extension's one long-lived program, which Chrome
 * nevertheless stops after thirty idle seconds and starts again for the next
 * event. So it keeps no state in memory — what must last is in
 * `chrome.storage` — and it registers every listener here, synchronously, at
 * the top level: Chrome hands the event that woke a worker only to listeners
 * added in its first turn.
 *
 * It holds no React and no session, and today it does one thing. Work that
 * has no page (a context menu, a shortcut, an alarm) or must outlive one (a
 * request the popup started and then closed on) belongs here: answer it with
 * `listen({...})` from `@/runtime/messaging`, beside a row in the protocol.
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  // A first install opens the options page, which signs the person in and
  // says what the extension can and cannot reach.
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) void openOptions();
});

if (import.meta.env.DEV) connectDevReload();
