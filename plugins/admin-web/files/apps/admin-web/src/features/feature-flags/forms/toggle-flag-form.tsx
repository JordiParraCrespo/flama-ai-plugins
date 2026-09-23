import {
  Alert,
  AlertDescription,
  Button,
  DialogFooter,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Textarea,
} from '@flama/design-system-web';
import { useErrorMessage, useZodResolver } from '@flama/frontend-web';
import { type ToggleFeatureFlagInput, toggleFeatureFlagSchema } from '@flama/shared/feature-flags';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

/** The reason a kill switch was pulled — it goes on the history with the operator's name. */
export function ToggleFlagForm({
  enabled,
  isPending,
  error,
  onSubmit,
  onCancel,
}: {
  /** Which way the switch is going. */
  enabled: boolean;
  isPending: boolean;
  error: Error | null;
  onSubmit: (values: ToggleFeatureFlagInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const resolveError = useErrorMessage();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ToggleFeatureFlagInput>({
    resolver: useZodResolver(toggleFeatureFlagSchema),
    defaultValues: { enabled, comment: '' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{resolveError(error, t('common.error')).message}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={Boolean(errors.comment)}>
          <FieldLabel htmlFor="toggle-comment">{t('control.flags.toggle.comment')}</FieldLabel>
          <Textarea
            {...register('comment')}
            id="toggle-comment"
            rows={2}
            placeholder={t('control.flags.toggle.commentPlaceholder')}
            disabled={isPending}
          />
          <FieldDescription>{t('control.flags.toggle.commentHint')}</FieldDescription>
          <FieldError errors={[errors.comment]} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant={enabled ? 'default' : 'destructive'} disabled={isPending}>
            {isPending
              ? t('control.flags.toggle.pending')
              : t(enabled ? 'control.flags.toggle.confirmOn' : 'control.flags.toggle.confirmOff')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
