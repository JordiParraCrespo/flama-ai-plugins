import { authKeys } from '@flama/frontend-core/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { listen } from '@/runtime/messaging';

/**
 * Keeps this page's idea of the session in step with the other extension
 * pages. Syncs with: `chrome.runtime` messages (`session/changed`).
 *
 * A sign-in or sign-out in one page changes the cookie every page shares, but
 * not what the others have already concluded from it. On the message, the
 * session is asked again: `useSessionRestore` re-reads it, flips the auth
 * store, and drops a cached answer that belonged to whoever was signed in
 * before.
 *
 * Reset, not invalidated. An invalidated session query keeps its old answer
 * while it refetches, so the gate stays open; the restore flips the auth store
 * *before* it drops the previous user's cache, and a page mounted in that gap
 * subscribes to a query the drop then removes under it — it showed a skeleton
 * forever. A reset sends the query back to pending: the gate holds its spinner
 * until the restore and the drop are both done, and only then mounts the page.
 */
export function useSessionSync(): void {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      listen({
        'session/changed': async () => {
          await queryClient.resetQueries({ queryKey: authKeys.session() });
          return undefined;
        },
      }),
    [queryClient],
  );
}
