import {
  Alert,
  AlertDescription,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@flama/design-system-web';
import type { FeatureFlag } from '@flama/frontend-admin';
import { useExplainFeatureFlag } from '@flama/frontend-admin/react';
import { useErrorMessage } from '@flama/frontend-web';
import type { EvaluateFeatureFlagInput } from '@flama/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Explanation } from '@/features/feature-flags/components/explanation';
import { ExplainForm } from '@/features/feature-flags/forms/explain-form';

/**
 * "Why does this customer see the old checkout?" — the question a flag
 * system has to answer without anyone signing in as them. Runs the same
 * evaluator the product does, on the same configuration.
 */
export function ExplainFlagDialog({ flag, onClose }: { flag: FeatureFlag; onClose: () => void }) {
  const { t } = useTranslation();
  const resolveError = useErrorMessage();
  const [context, setContext] = useState<EvaluateFeatureFlagInput | null>(null);
  const explanation = useExplainFeatureFlag(flag.key, context);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-140">
        <DialogHeader>
          <DialogTitle>{t('control.flags.explain.title', { key: flag.key })}</DialogTitle>
          <DialogDescription>{t('control.flags.explain.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <ExplainForm isPending={explanation.isFetching} onSubmit={setContext} />
            {explanation.data && <Explanation explanation={explanation.data} />}
            {explanation.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {resolveError(explanation.error, t('common.error')).message}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
