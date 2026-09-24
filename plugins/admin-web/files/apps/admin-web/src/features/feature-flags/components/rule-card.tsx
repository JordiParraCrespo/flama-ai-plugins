import { Button, FieldLabel, Input } from '@flama/design-system-web';
import { ArrowDown, ArrowUp, Plus, Trash2 } from '@flama/design-system-web/icons';
import type { FeatureFlag } from '@flama/frontend-admin';
import type { UpdateFeatureFlagInput } from '@flama/shared';
import { type Control, type UseFormRegister, useFieldArray } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ConditionRow } from '@/features/feature-flags/components/condition-row';
import { ServeEditor } from '@/features/feature-flags/components/serve-editor';
import { emptyCondition } from '@/features/feature-flags/lib/targeting';

/**
 * One rule of a flag's targeting: what it is for, who it matches (its
 * conditions, ANDed), and what it serves them.
 *
 * Its conditions are its own field array, so adding one re-renders this card
 * and not the rules around it.
 */
export function RuleCard({
  control,
  register,
  index,
  count,
  flag,
  disabled,
  onMove,
  onRemove,
}: {
  control: Control<UpdateFeatureFlagInput>;
  register: UseFormRegister<UpdateFeatureFlagInput>;
  index: number;
  count: number;
  flag: FeatureFlag;
  disabled: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const conditions = useFieldArray({ control, name: `rules.${index}.conditions` });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle p-4">
      <div className="flex items-center gap-2">
        <span className="flex-none text-sm font-medium text-ink-900">
          {t('control.flags.targeting.rule', { number: index + 1 })}
        </span>
        <Input
          {...register(`rules.${index}.description`)}
          placeholder={t('control.flags.targeting.ruleDescription')}
          aria-label={t('control.flags.targeting.ruleDescription')}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || index === 0}
          onClick={() => onMove(index - 1)}
          aria-label={t('control.flags.targeting.moveUp')}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || index === count - 1}
          onClick={() => onMove(index + 1)}
          aria-label={t('control.flags.targeting.moveDown')}
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onRemove}
          aria-label={t('control.flags.targeting.removeRule')}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>{t('control.flags.targeting.conditions')}</FieldLabel>
        {conditions.fields.length === 0 && (
          <p className="text-sm text-ink-400">{t('control.flags.targeting.noConditions')}</p>
        )}
        {conditions.fields.map((condition, conditionIndex) => (
          <ConditionRow
            key={condition.id}
            control={control}
            name={`rules.${index}.conditions.${conditionIndex}`}
            allowSegments
            disabled={disabled}
            onRemove={() => conditions.remove(conditionIndex)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={disabled}
          onClick={() => conditions.append(emptyCondition())}
        >
          <Plus />
          {t('control.flags.targeting.addCondition')}
        </Button>
      </div>

      <ServeEditor
        control={control}
        name={`rules.${index}.serve`}
        flag={flag}
        label={t('control.flags.targeting.serve')}
        disabled={disabled}
      />
    </div>
  );
}
