import {
  Alert,
  AlertDescription,
  Button,
  DialogBody,
  DialogFooter,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Switch,
  Textarea,
} from '@flama/design-system-web';
import { Plus } from '@flama/design-system-web/icons';
import type { FeatureFlag } from '@flama/frontend-admin';
import { useErrorMessage, useZodResolver } from '@flama/frontend-web';
import { type UpdateFeatureFlagInput, updateFeatureFlagSchema } from '@flama/shared/feature-flags';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { RuleCard } from '@/features/feature-flags/components/rule-card';
import { ServeEditor } from '@/features/feature-flags/components/serve-editor';
import { emptyRule, formatValue, offValueOf } from '@/features/feature-flags/lib/targeting';

/**
 * A flag's whole targeting: the master switch, the ordered rules and what
 * everyone else gets, saved in one write with a reason for the history.
 *
 * Validated against the same schema the API uses; whether a served value is
 * one this flag takes is also checked there, but the pickers only offer those.
 */
export function TargetingForm({
  flag,
  isPending,
  error,
  onSubmit,
  onCancel,
}: {
  flag: FeatureFlag;
  isPending: boolean;
  error: Error | null;
  onSubmit: (values: UpdateFeatureFlagInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const resolveError = useErrorMessage();
  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<UpdateFeatureFlagInput>({
    resolver: useZodResolver(updateFeatureFlagSchema),
    // A flag nobody has targeted behaves as "on, no rules, the default for
    // everyone" — so that is where editing starts.
    defaultValues: {
      enabled: flag.targeting?.enabled ?? true,
      rules: flag.targeting?.rules ?? [],
      fallthrough: flag.targeting?.fallthrough ?? { value: flag.defaultValue },
      comment: '',
    },
  });
  const rules = useFieldArray({ control, name: 'rules' });

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

          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="flag-enabled">
                    {t('control.flags.targeting.enabled')}
                  </FieldLabel>
                  <FieldDescription>
                    {t('control.flags.targeting.enabledHint', {
                      value: formatValue(offValueOf(flag)),
                    })}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="flag-enabled"
                  checked={field.value}
                  onCheckedChange={(next) => field.onChange(next)}
                  disabled={isPending}
                />
              </Field>
            )}
          />

          <Field>
            <FieldLabel>{t('control.flags.targeting.rules')}</FieldLabel>
            {rules.fields.length === 0 && (
              <p className="text-sm text-ink-400">{t('control.flags.targeting.noRules')}</p>
            )}
            {rules.fields.map((rule, index) => (
              <RuleCard
                key={rule.id}
                control={control}
                register={register}
                index={index}
                count={rules.fields.length}
                flag={flag}
                disabled={isPending}
                onMove={(to) => rules.move(index, to)}
                onRemove={() => rules.remove(index)}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={isPending}
              onClick={() => rules.append(emptyRule(flag, getValues('rules')))}
            >
              <Plus />
              {t('control.flags.targeting.addRule')}
            </Button>
            <FieldError errors={[errors.rules?.root, errors.rules]} />
          </Field>

          <ServeEditor
            control={control}
            name="fallthrough"
            flag={flag}
            label={t('control.flags.targeting.fallthrough')}
            disabled={isPending}
          />

          <Field data-invalid={Boolean(errors.comment)}>
            <FieldLabel htmlFor="flag-comment">{t('control.flags.targeting.comment')}</FieldLabel>
            <Textarea
              {...register('comment')}
              id="flag-comment"
              rows={2}
              placeholder={t('control.flags.targeting.commentPlaceholder')}
              disabled={isPending}
            />
            <FieldError errors={[errors.comment]} />
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t('control.flags.targeting.saving') : t('control.flags.targeting.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
