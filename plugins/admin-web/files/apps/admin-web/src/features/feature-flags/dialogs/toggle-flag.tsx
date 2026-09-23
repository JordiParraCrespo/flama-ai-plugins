import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@flama/design-system-web';
import type { FeatureFlag } from '@flama/frontend-admin';
import { useToggleFeatureFlag } from '@flama/frontend-admin/react';
import { useTranslation } from 'react-i18next';
import { ToggleFlagForm } from '@/features/feature-flags/forms/toggle-flag-form';
import { formatValue, offValueOf } from '@/features/feature-flags/lib/targeting';

/**
 * Switching a flag reaches every user of the deployment at once, so it asks
 * first — and asks why, for the history. Switching off says exactly what
 * everyone will get instead.
 */
export function ToggleFlagDialog({
  flag,
  enabled,
  onClose,
}: {
  flag: FeatureFlag;
  enabled: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toggle = useToggleFeatureFlag();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-120">
        <DialogHeader>
          <DialogTitle>
            {t(enabled ? 'control.flags.toggle.onTitle' : 'control.flags.toggle.offTitle', {
              key: flag.key,
            })}
          </DialogTitle>
          <DialogDescription>
            {enabled
              ? t('control.flags.toggle.onDescription')
              : t('control.flags.toggle.offDescription', { value: formatValue(offValueOf(flag)) })}
          </DialogDescription>
        </DialogHeader>
        <ToggleFlagForm
          enabled={enabled}
          isPending={toggle.isPending}
          error={toggle.error}
          onCancel={onClose}
          onSubmit={(dto) =>
            toggle.mutate({ key: flag.key, dto: { ...dto, enabled } }, { onSuccess: onClose })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
