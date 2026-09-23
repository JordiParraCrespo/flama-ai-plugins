import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@flama/design-system-web';
import type { FlagSegment } from '@flama/frontend-admin';
import { useCreateFlagSegment, useUpdateFlagSegment } from '@flama/frontend-admin/react';
import { useTranslation } from 'react-i18next';
import { SegmentForm } from '@/features/feature-flags/forms/segment-form';

export function SegmentEditorDialog({
  segment,
  onClose,
}: {
  /** The segment being edited; absent when creating. */
  segment?: FlagSegment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateFlagSegment();
  const update = useUpdateFlagSegment();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-155">
        <DialogHeader>
          <DialogTitle>
            {t(segment ? 'control.flags.segments.editTitle' : 'control.flags.segments.newTitle')}
          </DialogTitle>
          <DialogDescription>{t('control.flags.segments.formDescription')}</DialogDescription>
        </DialogHeader>
        <SegmentForm
          segment={segment}
          isPending={create.isPending || update.isPending}
          error={create.error ?? update.error}
          onCancel={onClose}
          onSubmit={({ key, name, description, conditions }) => {
            if (segment) {
              update.mutate(
                { key: segment.key, dto: { name, description: description || null, conditions } },
                { onSuccess: onClose },
              );
            } else {
              create.mutate(
                { key, name, description: description || undefined, conditions },
                { onSuccess: onClose },
              );
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
