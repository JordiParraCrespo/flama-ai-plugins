import { Switch } from '@flama/design-system-web';
import type { FeatureFlag } from '@flama/frontend-admin';
import { useTranslation } from 'react-i18next';

/**
 * The master switch in a table row. It never flips anything itself: a change
 * that reaches every user asks for confirmation and a reason first, so this
 * only reports which way the operator wants to go.
 *
 * A flag nobody has targeted is on — it serves its default — which is what the
 * API does with it too.
 */
export function FlagSwitch({
  flag,
  onRequestChange,
}: {
  flag: FeatureFlag;
  onRequestChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const enabled = flag.targeting?.enabled ?? true;

  return (
    <Switch
      checked={enabled}
      onCheckedChange={(next) => onRequestChange(next)}
      aria-label={t(enabled ? 'control.flags.toggle.confirmOff' : 'control.flags.toggle.confirmOn')}
    />
  );
}
