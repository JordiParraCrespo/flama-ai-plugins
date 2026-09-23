import {
  Button,
  Field,
  FieldError,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@flama/design-system-web';
import { X } from '@flama/design-system-web/icons';
import { FLAG_ATTRIBUTES, FLAG_OPERATORS, type FlagAttribute } from '@flama/shared/feature-flags';
import { type Control, type FieldValues, type Path, useController } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { textToValues, valuesToText } from '@/features/feature-flags/lib/targeting';

/**
 * One `attribute operator values` line of a rule or a segment.
 *
 * Each of the three fields is its own controller, so typing a value re-renders
 * this row and nothing else in the dialog. `name` is the condition's path in
 * whichever form holds it — a rule's conditions or a segment's.
 */
export function ConditionRow<TForm extends FieldValues>({
  control,
  name,
  allowSegments,
  disabled,
  onRemove,
}: {
  control: Control<TForm>;
  name: string;
  /** A segment's own conditions may not reference a segment. */
  allowSegments: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const attribute = useController({ control, name: `${name}.attribute` as Path<TForm> });
  const operator = useController({ control, name: `${name}.operator` as Path<TForm> });
  const values = useController({ control, name: `${name}.values` as Path<TForm> });

  const attributes = FLAG_ATTRIBUTES.filter((value) => allowSegments || value !== 'segment');
  const attributeLabels = Object.fromEntries(
    attributes.map((value) => [value, t(`control.flags.attributes.${value}`)]),
  );
  const operatorLabels = Object.fromEntries(
    FLAG_OPERATORS.map((value) => [value, t(`control.flags.operators.${value}`)]),
  );
  const invalid = Boolean(values.fieldState.error ?? operator.fieldState.error);

  return (
    <div className="rounded-lg border border-border-subtle p-3">
      <Field data-invalid={invalid}>
        <div className="flex items-center gap-2">
          <Select
            items={attributeLabels}
            value={attribute.field.value as FlagAttribute}
            onValueChange={(next) => attribute.field.onChange(next)}
            disabled={disabled}
          >
            <SelectTrigger aria-label={t('control.flags.targeting.attribute')} className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {attributes.map((value) => (
                <SelectItem key={value} value={value}>
                  {attributeLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={operatorLabels}
            value={operator.field.value as string}
            onValueChange={(next) => operator.field.onChange(next)}
            disabled={disabled}
          >
            <SelectTrigger aria-label={t('control.flags.targeting.operator')} className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLAG_OPERATORS.map((value) => (
                <SelectItem key={value} value={value}>
                  {operatorLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            aria-label={t('control.flags.targeting.removeCondition')}
          >
            <X />
          </Button>
        </div>
        <Textarea
          // The stored value is an array; the field is text, one value a line.
          defaultValue={valuesToText((values.field.value as string[] | undefined) ?? [])}
          onBlur={(event) => {
            values.field.onChange(textToValues(event.target.value));
            values.field.onBlur();
          }}
          placeholder={t('control.flags.targeting.valuesHint')}
          aria-label={t('control.flags.targeting.values')}
          aria-invalid={invalid}
          rows={2}
          disabled={disabled}
        />
        <FieldError errors={[values.fieldState.error, operator.fieldState.error]} />
      </Field>
    </div>
  );
}
