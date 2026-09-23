import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from '@flama/design-system-web';
import { Plus, X } from '@flama/design-system-web/icons';
import type { FeatureFlag } from '@flama/frontend-admin';
import type { FlagServe, FlagValue } from '@flama/shared';
import { type Control, type FieldValues, type Path, useController } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  evenSplit,
  formatValue,
  parseValue,
  valuesOf,
} from '@/features/feature-flags/lib/targeting';

/**
 * What a rule — or the fallthrough — serves: one value, or a percentage split.
 *
 * The whole `serve` object is one controller, because switching between the
 * two shapes replaces it; the value picker only ever offers what the flag
 * takes, so a boolean flag cannot be handed the string `"true"`.
 */
export function ServeEditor<TForm extends FieldValues>({
  control,
  name,
  flag,
  label,
  disabled,
}: {
  control: Control<TForm>;
  name: string;
  flag: FeatureFlag;
  label: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { field, fieldState } = useController({ control, name: name as Path<TForm> });
  const serve = field.value as FlagServe;
  const values = valuesOf(flag);
  const valueLabels = Object.fromEntries(
    values.map((value) => [String(value), formatValue(value)]),
  );
  const mode = 'split' in serve ? 'split' : 'value';
  const total = 'split' in serve ? serve.split.reduce((sum, arm) => sum + arm.weight, 0) : 100;

  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        <ToggleGroup
          value={[mode]}
          onValueChange={(next: string[]) => {
            const picked = next[0];
            if (!picked || picked === mode) return;
            field.onChange(
              picked === 'split' ? evenSplit(flag) : { value: values[0] as FlagValue },
            );
          }}
          disabled={disabled}
          size="sm"
        >
          <ToggleGroupItem value="value">{t('control.flags.targeting.serveValue')}</ToggleGroupItem>
          <ToggleGroupItem value="split">{t('control.flags.targeting.serveSplit')}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {'split' in serve ? (
        <div className="flex flex-col gap-2">
          {serve.split.map((arm, index) => (
            // Arm values are unique — each picker offers only values no other
            // arm has — so the value is the arm's identity.
            <div key={String(arm.value)} className="flex items-center gap-2">
              <Select
                items={valueLabels}
                value={String(arm.value)}
                onValueChange={(next) =>
                  field.onChange({
                    split: serve.split.map((current, at) =>
                      at === index
                        ? { ...current, value: parseValue(flag, String(next)) }
                        : current,
                    ),
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger className="flex-1" aria-label={t('control.flags.targeting.serve')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {values
                    .filter(
                      (value) =>
                        value === arm.value || !serve.split.some((other) => other.value === value),
                    )
                    .map((value) => (
                      <SelectItem key={String(value)} value={String(value)}>
                        {formatValue(value)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={arm.weight}
                onChange={(event) =>
                  field.onChange({
                    split: serve.split.map((current, at) =>
                      at === index ? { ...current, weight: Number(event.target.value) } : current,
                    ),
                  })
                }
                aria-label={t('control.flags.targeting.weight')}
                className="w-24"
                disabled={disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || serve.split.length <= 1}
                onClick={() =>
                  field.onChange({ split: serve.split.filter((_, at) => at !== index) })
                }
                aria-label={t('control.flags.targeting.removeArm')}
              >
                <X />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || serve.split.length >= values.length}
              onClick={() => {
                const unused = values.find(
                  (value) => !serve.split.some((arm) => arm.value === value),
                );
                if (unused !== undefined) {
                  field.onChange({ split: [...serve.split, { value: unused, weight: 0 }] });
                }
              }}
            >
              <Plus />
              {t('control.flags.targeting.addArm')}
            </Button>
            <span className="text-xs text-ink-400">
              {t('control.flags.targeting.splitTotal', { total })}
            </span>
          </div>
        </div>
      ) : (
        <Select
          items={valueLabels}
          value={String(serve.value)}
          onValueChange={(next) => field.onChange({ value: parseValue(flag, String(next)) })}
          disabled={disabled}
        >
          <SelectTrigger aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {values.map((value) => (
              <SelectItem key={String(value)} value={String(value)}>
                {formatValue(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <FieldError errors={[fieldState.error]} />
    </Field>
  );
}
