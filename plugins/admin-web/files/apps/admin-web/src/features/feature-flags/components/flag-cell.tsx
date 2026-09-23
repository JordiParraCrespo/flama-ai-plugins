import { Flag } from '@flama/design-system-web/icons';
import type { FeatureFlag } from '@flama/frontend-admin';

/** The flags table's first column: the key an engineer greps for, and what it does. */
export function FlagCell({ flag }: { flag: FeatureFlag }) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex size-8 flex-none items-center justify-center rounded-lg border border-border-subtle bg-surface-sunken text-ink-600">
        <Flag className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-sm font-medium text-ink-900">{flag.key}</span>
        <span className="block max-w-96 truncate text-xs text-ink-400">{flag.description}</span>
      </span>
    </span>
  );
}
