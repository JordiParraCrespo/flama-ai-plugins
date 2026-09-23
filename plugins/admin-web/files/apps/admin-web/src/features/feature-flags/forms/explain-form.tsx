import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@flama/design-system-web';
import { useZodResolver } from '@flama/frontend-web';
import {
  type EvaluateFeatureFlagInput,
  evaluateFeatureFlagSchema,
  FLAG_PLATFORMS,
} from '@flama/shared/feature-flags';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

const TEXT_FIELDS = ['userId', 'organizationId', 'email', 'role', 'appVersion'] as const;

/**
 * Describe someone — as much of them as the operator knows — to ask what a
 * flag would serve them. Empty fields are left out, which is what an anonymous
 * caller looks like.
 */
export function ExplainForm({
  isPending,
  onSubmit,
}: {
  isPending: boolean;
  onSubmit: (values: EvaluateFeatureFlagInput) => void;
}) {
  const { t } = useTranslation();
  const { register, control, handleSubmit } = useForm<EvaluateFeatureFlagInput>({
    resolver: useZodResolver(evaluateFeatureFlagSchema),
    defaultValues: {},
  });
  const platformLabels = Object.fromEntries(FLAG_PLATFORMS.map((value) => [value, value]));

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit(
          Object.fromEntries(
            Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
          ) as EvaluateFeatureFlagInput,
        ),
      )}
      noValidate
    >
      <FieldGroup className="grid grid-cols-2">
        {TEXT_FIELDS.map((name) => (
          <Field key={name}>
            <FieldLabel htmlFor={`explain-${name}`}>
              {t(`control.flags.attributes.${name}`)}
            </FieldLabel>
            <Input {...register(name)} id={`explain-${name}`} disabled={isPending} />
          </Field>
        ))}
        <Controller
          control={control}
          name="platform"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="explain-platform">
                {t('control.flags.attributes.platform')}
              </FieldLabel>
              <Select
                items={platformLabels}
                value={field.value ?? null}
                onValueChange={(next) => field.onChange(next ?? undefined)}
                disabled={isPending}
              >
                <SelectTrigger id="explain-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLAG_PLATFORMS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" className="mt-4" disabled={isPending}>
        {t('control.flags.explain.submit')}
      </Button>
    </form>
  );
}
