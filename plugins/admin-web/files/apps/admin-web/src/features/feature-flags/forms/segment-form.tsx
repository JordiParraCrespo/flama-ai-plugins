import {
  Alert,
  AlertDescription,
  Button,
  DialogBody,
  DialogFooter,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from '@flama/design-system-web';
import { Plus } from '@flama/design-system-web/icons';
import type { FlagSegment } from '@flama/frontend-admin';
import { useErrorMessage, useZodResolver } from '@flama/frontend-web';
import { type CreateFlagSegmentInput, createFlagSegmentSchema } from '@flama/shared/feature-flags';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ConditionRow } from '@/features/feature-flags/components/condition-row';
import { emptyCondition } from '@/features/feature-flags/lib/targeting';

/**
 * A segment: its key (what rules refer to it by, so fixed once created), a
 * name, and the conditions — ANDed — that decide who is in it.
 */
export function SegmentForm({
  segment,
  isPending,
  error,
  onSubmit,
  onCancel,
}: {
  /** The segment being edited; absent when creating. */
  segment?: FlagSegment;
  isPending: boolean;
  error: Error | null;
  onSubmit: (values: CreateFlagSegmentInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const resolveError = useErrorMessage();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateFlagSegmentInput>({
    resolver: useZodResolver(createFlagSegmentSchema),
    defaultValues: {
      key: segment?.key ?? '',
      name: segment?.name ?? '',
      description: segment?.description ?? '',
      conditions: segment?.conditions ?? [emptyCondition()],
    },
  });
  const conditions = useFieldArray({ control, name: 'conditions' });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex min-h-0 flex-auto flex-col gap-5"
    >
      <DialogBody>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{resolveError(error, t('common.error')).message}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(errors.key)}>
            <FieldLabel htmlFor="segment-key">{t('control.flags.segments.key')}</FieldLabel>
            <Input
              {...register('key')}
              id="segment-key"
              aria-invalid={Boolean(errors.key)}
              disabled={isPending || Boolean(segment)}
            />
            <FieldDescription>{t('control.flags.segments.keyHint')}</FieldDescription>
            <FieldError errors={[errors.key]} />
          </Field>
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="segment-name">{t('control.flags.segments.name')}</FieldLabel>
            <Input
              {...register('name')}
              id="segment-name"
              aria-invalid={Boolean(errors.name)}
              disabled={isPending}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={Boolean(errors.description)}>
            <FieldLabel htmlFor="segment-description">
              {t('control.flags.segments.details')}
            </FieldLabel>
            <Input {...register('description')} id="segment-description" disabled={isPending} />
            <FieldError errors={[errors.description]} />
          </Field>
          <Field data-invalid={Boolean(errors.conditions)}>
            <FieldLabel>{t('control.flags.targeting.conditions')}</FieldLabel>
            {conditions.fields.map((condition, index) => (
              <ConditionRow
                key={condition.id}
                control={control}
                name={`conditions.${index}`}
                allowSegments={false}
                disabled={isPending}
                onRemove={() => conditions.remove(index)}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={isPending}
              onClick={() => conditions.append(emptyCondition())}
            >
              <Plus />
              {t('control.flags.targeting.addCondition')}
            </Button>
            <FieldError errors={[errors.conditions?.root, errors.conditions]} />
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? t('control.flags.segments.saving')
            : t(segment ? 'control.flags.segments.save' : 'control.flags.segments.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
