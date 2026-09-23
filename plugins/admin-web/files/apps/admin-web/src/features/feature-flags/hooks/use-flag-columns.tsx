import type { FeatureFlag } from '@flama/frontend-admin';
import type { DataTableColumn } from '@flama/frontend-web';
import { useTranslation } from 'react-i18next';
import { FlagCell } from '@/features/feature-flags/components/flag-cell';
import { FlagKindBadge } from '@/features/feature-flags/components/flag-kind-badge';
import { FlagSwitch } from '@/features/feature-flags/components/flag-switch';
import { ServingSummary } from '@/features/feature-flags/components/serving-summary';

/**
 * The flags table's columns. `onRequestToggle` is the table's: the switch only
 * asks, and the section opens the confirmation that does the work.
 */
export function useFlagColumns(
  onRequestToggle: (flag: FeatureFlag, enabled: boolean) => void,
): DataTableColumn<FeatureFlag>[] {
  const { t } = useTranslation();

  return [
    {
      key: 'flag',
      label: t('control.flags.columns.flag'),
      width: 360,
      render: (flag) => <FlagCell flag={flag} />,
    },
    {
      key: 'kind',
      label: t('control.flags.columns.kind'),
      width: 140,
      render: (flag) => <FlagKindBadge flag={flag} />,
    },
    {
      key: 'serving',
      label: t('control.flags.columns.serving'),
      width: 280,
      render: (flag) => <ServingSummary flag={flag} />,
    },
    {
      key: 'enabled',
      label: t('control.flags.columns.enabled'),
      width: 80,
      render: (flag) => (
        <FlagSwitch flag={flag} onRequestChange={(enabled) => onRequestToggle(flag, enabled)} />
      ),
    },
  ];
}
