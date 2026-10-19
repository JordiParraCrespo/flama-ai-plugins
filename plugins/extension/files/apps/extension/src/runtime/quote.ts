/**
 * Selected text as a clip keeps it. A module of its own, free of the storage
 * schema, because the content script reads it too and should not carry Zod
 * into somebody else's page for one function.
 */

/** Long enough for a paragraph, short enough that a whole article is not a "quote". */
export const MAX_QUOTE = 2_000;

/**
 * Whitespace collapsed, at most `MAX_QUOTE` characters. Every path to a clip's
 * quote goes through this — the page's selection and the text a context-menu
 * click hands over — so `MAX_CLIPS` clips stay inside the storage quota
 * whichever way they came.
 */
export function toQuote(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE);
}
