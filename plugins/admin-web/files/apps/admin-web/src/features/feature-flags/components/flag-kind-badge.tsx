import { Badge } from '@flama/design-system-web';
import type { FeatureFlag } from '@flama/frontend-admin';
import { useTranslation } from 'react-i18next';

/**
 * The flag's kind, and — for a temporary one — its due date. An expired flag
 * says so loudly: it is debt the code owes, and CI is already failing on it.
 */
export function FlagKindBadge({ flag }: { flag: FeatureFlag }) {
  const { t } = useTranslation();

  return (
    <span className="flex flex-col items-start gap-1">
      <Badge variant="neutral">{t(`control.flags.kinds.${flag.kind}`)}</Badge>
      {flag.expired && flag.expiresAt ? (
        <Badge variant="ended" title={t('control.flags.expiredHint', { date: flag.expiresAt })}>
          {t('control.flags.expired')}
        </Badge>
      ) : (
        flag.expiresAt && (
          <span className="text-xs text-ink-400">
            {t('control.flags.expires', { date: flag.expiresAt })}
          </span>
        )
      )}
    </span>
  );
}
