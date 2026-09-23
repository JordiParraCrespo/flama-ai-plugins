import type { FlagChange } from '@flama/frontend-admin';
import { type DataTableColumn, dateFormatter, useLocale } from '@flama/frontend-web';
import { useTranslation } from 'react-i18next';
import { ChangeSummary } from '@/features/feature-flags/components/change-summary';

const WHEN: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/** The history table's columns. */
export function useChangeColumns(): DataTableColumn<FlagChange>[] {
  const { t } = useTranslation();
  const formatter = dateFormatter(useLocale(), WHEN);

  return [
    {
      key: 'when',
      label: t('control.flags.history.columns.when'),
      width: 180,
      render: (change) => (
        <span className="text-sm text-ink-600">{formatter.format(change.createdAt)}</span>
      ),
    },
    {
      key: 'subject',
      label: t('control.flags.history.columns.subject'),
      width: 220,
      render: (change) => (
        <span className="font-mono text-sm text-ink-900">{change.subjectKey}</span>
      ),
    },
    {
      key: 'change',
      label: t('control.flags.history.columns.change'),
      width: 180,
      render: (change) => <ChangeSummary change={change} />,
    },
    {
      key: 'by',
      label: t('control.flags.history.columns.by'),
      width: 200,
      render: (change) => (
        <span className="font-mono text-xs text-ink-600">
          {change.actorId ?? t('control.flags.history.unknownActor')}
        </span>
      ),
    },
    {
      key: 'comment',
      label: t('control.flags.history.columns.comment'),
      width: 280,
      render: (change) => <span className="text-sm text-ink-600">{change.comment || '—'}</span>,
    },
  ];
}
