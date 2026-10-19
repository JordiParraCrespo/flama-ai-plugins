import type { PageSnapshot } from '@/runtime/protocol';
import { toQuote } from '@/runtime/quote';

/**
 * What a page shows, read when asked and not before. Only what the person can
 * see is read — the address, the title, their own selection and the summary
 * the page publishes about itself — never form fields or the DOM at large.
 */
export function readSnapshot(document: Document, selection: Selection | null): PageSnapshot {
  const description =
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ??
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ??
    '';

  return {
    url: document.URL,
    title: document.title,
    selection: toQuote(selection?.toString() ?? ''),
    description: description.trim(),
  };
}
