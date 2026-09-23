import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogHero,
  DialogHeroPlate,
  DialogTitle,
} from '@flama/design-system-web';
import { Flag } from '@flama/design-system-web/icons';
import type { FeatureFlag } from '@flama/frontend-admin';
import { useUpdateFeatureFlag } from '@flama/frontend-admin/react';
import { useTranslation } from 'react-i18next';
import { TargetingForm } from '@/features/feature-flags/forms/targeting-form';

export function TargetingEditorDialog({
  flag,
  onClose,
}: {
  flag: FeatureFlag;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateFeatureFlag();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-180">
        <DialogHero gradient="tealGreen">
          <DialogHeroPlate>
            <Flag />
          </DialogHeroPlate>
        </DialogHero>
        <DialogHeader>
          <DialogTitle>{t('control.flags.targeting.title', { key: flag.key })}</DialogTitle>
          <DialogDescription>{t('control.flags.targeting.description')}</DialogDescription>
        </DialogHeader>
        <TargetingForm
          flag={flag}
          isPending={update.isPending}
          error={update.error}
          onCancel={onClose}
          onSubmit={(dto) => update.mutate({ key: flag.key, dto }, { onSuccess: onClose })}
        />
      </DialogContent>
    </Dialog>
  );
}
