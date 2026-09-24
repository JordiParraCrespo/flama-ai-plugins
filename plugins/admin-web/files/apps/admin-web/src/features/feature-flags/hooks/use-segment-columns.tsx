import type { FlagSegment } from '@flama/frontend-admin';
import type { DataTableColumn } from '@flama/frontend-web';
import { useTranslation } from 'react-i18next';

/** The segments table's columns. */
export function useSegmentColumns(): DataTableColumn<FlagSegment>[] {
  const { t } = useTranslation();

  return [
    {
      key: 'segment',
      label: t('control.flags.segments.columns.segment'),
      width: 320,
      render: (segment) => (
        <span className="min-w-0">
          <span className="block font-medium text-ink-900">{segment.name}</span>
          <span className="block font-mono text-xs text-ink-400">{segment.key}</span>
        </span>
      ),
    },
    {
      key: 'conditions',
      label: t('control.flags.segments.columns.conditions'),
      width: 160,
      render: (segment) => (
        <span className="text-sm text-ink-600">
          {t('control.flags.segments.conditionCount', { count: segment.conditions.length })}
        </span>
      ),
    },
    {
      key: 'usedBy',
      label: t('control.flags.segments.columns.usedBy'),
      width: 260,
      render: (segment) => (
        <span className="font-mono text-xs text-ink-600">
          {segment.usedBy.length > 0
            ? segment.usedBy.join(', ')
            : t('control.flags.segments.unused')}
        </span>
      ),
    },
  ];
}
