import type { FeatureFlag } from '@flama/frontend-admin';
import { useTranslation } from 'react-i18next';
import { describeSplit, formatValue, offValueOf } from '@/features/feature-flags/lib/targeting';

/**
 * What a flag is serving right now, in a line: the default when nobody has
 * targeted it, the off value when it is switched off, otherwise its rules and
 * what everyone else gets.
 */
export function ServingSummary({ flag }: { flag: FeatureFlag }) {
  const { t } = useTranslation();
  const targeting = flag.targeting;

  if (!targeting) {
    return (
      <span className="text-sm text-ink-400">
        {t('control.flags.serving.default', { value: formatValue(flag.defaultValue) })}
      </span>
    );
  }

  if (!targeting.enabled) {
    return (
      <span className="text-sm text-ink-600">
        {t('control.flags.serving.off', { value: formatValue(offValueOf(flag)) })}
      </span>
    );
  }

  const fallthrough =
    'split' in targeting.fallthrough
      ? t('control.flags.serving.split', { arms: describeSplit(targeting.fallthrough) })
      : t('control.flags.serving.value', { value: formatValue(targeting.fallthrough.value) });

  return (
    <span className="text-sm text-ink-600">
      {targeting.rules.length > 0 && (
        <>{t('control.flags.serving.rules', { count: targeting.rules.length })} </>
      )}
      {fallthrough}
    </span>
  );
}
