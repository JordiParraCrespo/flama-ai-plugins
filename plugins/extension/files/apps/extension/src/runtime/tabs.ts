/**
 * Windows, tabs and the extension's own pages, as the rest of the code needs
 * them. Every `chrome.tabs`, `chrome.windows` and `chrome.sidePanel` call in
 * the extension is one of these.
 */

/** Where Chrome lists and edits every extension's shortcuts. */
export const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

/** The window this page belongs to. Read ahead of a click: see `openSidePanel`. */
export async function currentWindowId(): Promise<number | undefined> {
  return (await chrome.windows.getCurrent()).id;
}

/**
 * Must run inside the click that asked for it: Chrome requires a user gesture,
 * and the gesture does not survive an `await`. So the window id is read before
 * the click (`currentWindowId`), and this is the first call the click makes.
 */
export async function openSidePanel(windowId: number): Promise<void> {
  await chrome.sidePanel.open({ windowId });
}

export async function openOptions(): Promise<void> {
  await chrome.runtime.openOptionsPage();
}

export async function openUrl(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}

/** The keys bound to one of the manifest's `commands`, as Chrome prints them; empty if unbound. */
export async function shortcutFor(command: string): Promise<string> {
  const commands = await chrome.commands.getAll();
  return commands.find((entry) => entry.name === command)?.shortcut ?? '';
}
