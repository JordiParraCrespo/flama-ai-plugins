import { Alert, AlertDescription, AlertTitle } from '@flama/design-system-web';
import type { FlagExplanation } from '@flama/frontend-admin';
import { useTranslation } from 'react-i18next';
import { formatValue } from '@/features/feature-flags/lib/targeting';

/** The answer to "what does this person get, and why". */
export function Explanation({ explanation }: { explanation: FlagExplanation }) {
  const { t } = useTranslation();

  return (
    <Alert variant={explanation.reason === 'ERROR' ? 'destructive' : 'default'}>
      <AlertTitle>
        {t('control.flags.explain.result', { value: formatValue(explanation.value) })}
      </AlertTitle>
      <AlertDescription>
        {t(`control.flags.explain.reasons.${explanation.reason}`, {
          rule: explanation.ruleId ?? '',
        })}
      </AlertDescription>
    </Alert>
  );
}
