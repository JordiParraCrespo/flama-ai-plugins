import type { FlagSegment } from '@flama/frontend-admin';
import { useDeleteFlagSegment } from '@flama/frontend-admin/react';
import { ConfirmDialog } from '@flama/frontend-web';
import { useTranslation } from 'react-i18next';

/**
 * A segment a rule still targets cannot go — the API refuses with `FLAG_006`,
 * because the rule would silently match nobody — so the dialog says which
 * flags to edit first rather than letting the operator find out by failing.
 */
export function DeleteSegmentDialog({
  segment,
  onClose,
}: {
  segment: FlagSegment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const remove = useDeleteFlagSegment();
  const inUse = segment.usedBy.length > 0;

  return (
    <ConfirmDialog
      title={t('control.flags.segments.deleteTitle')}
      description={
        inUse
          ? t('control.flags.segments.inUse', { flags: segment.usedBy.join(', ') })
          : t('control.flags.segments.deleteDescription')
      }
      // The confirm button stays disabled while a flag still targets it: the
      // request could only come back FLAG_006.
      pending={remove.isPending || inUse}
      error={remove.error}
      onClose={onClose}
      onConfirm={() => remove.mutate(segment.key, { onSuccess: onClose })}
    />
  );
}
