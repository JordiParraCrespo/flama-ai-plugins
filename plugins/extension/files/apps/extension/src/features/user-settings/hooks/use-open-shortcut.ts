import { useEffect, useState } from 'react';
import { shortcutFor } from '@/runtime/tabs';

/**
 * The keys bound to opening the extension (`_execute_action`), as Chrome
 * prints them. Syncs with: `chrome.commands`. Read rather than hard-coded,
 * because the person can rebind it; empty when they unbound it.
 */
export function useOpenShortcut(): string {
  const [shortcut, setShortcut] = useState('');

  useEffect(() => {
    let live = true;
    void shortcutFor('_execute_action').then((keys) => {
      if (live) setShortcut(keys);
    });
    return () => {
      live = false;
    };
  }, []);

  return shortcut;
}
