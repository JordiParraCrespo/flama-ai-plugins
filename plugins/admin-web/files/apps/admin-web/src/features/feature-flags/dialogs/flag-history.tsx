import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from '@flama/design-system-web';
import type { FeatureFlag } from '@flama/frontend-admin';
import { useFlagChanges } from '@flama/frontend-admin/react';
import { dateFormatter, useLocale } from '@flama/frontend-web';
import { useTranslation } from 'react-i18next';
import { ChangeSummary } from '@/features/feature-flags/components/change-summary';

const RECENT = 20;
const WHEN: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/**
 * One flag's recent history, from its row. The full, searchable trail is the
 * History tab; this is the "what happened to this switch" answer in one click.
 */
export function FlagHistoryDialog({ flag, onClose }: { flag: FeatureFlag; onClose: () => void }) {
  const { t } = useTranslation();
  const formatter = dateFormatter(useLocale(), WHEN);
  const changes = useFlagChanges({ subjectType: 'flag', subjectKey: flag.key, limit: RECENT });
  const rows = changes.data?.data ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-140">
        <DialogHeader>
          <DialogTitle>
            {t('control.flags.actions.history')}: <span className="font-mono">{flag.key}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {rows.length === 0 && !changes.isLoading ? (
            <EmptyState>
              <EmptyState.Header>
                <EmptyState.Title>{t('control.flags.history.empty')}</EmptyState.Title>
              </EmptyState.Header>
            </EmptyState>
          ) : (
            <ol className="flex flex-col divide-y divide-border-subtle">
              {rows.map((change) => (
                <li key={change.id} className="flex flex-col gap-1 py-3">
                  <span className="flex items-center justify-between gap-3">
                    <ChangeSummary change={change} />
                    <span className="text-xs text-ink-400">
                      {formatter.format(change.createdAt)}
                    </span>
                  </span>
                  {change.comment && <span className="text-sm text-ink-600">{change.comment}</span>}
                  <span className="font-mono text-xs text-ink-400">
                    {change.actorId ?? t('control.flags.history.unknownActor')}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
