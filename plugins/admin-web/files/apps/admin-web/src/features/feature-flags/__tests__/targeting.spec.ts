import { describe, expect, it } from 'vitest';
import {
  describeSplit,
  emptyRule,
  evenSplit,
  newRuleId,
  offValueOf,
  parseValue,
  textToValues,
  valuesOf,
} from '@/features/feature-flags/lib/targeting';

const booleanFlag = { type: 'boolean' as const, variants: [], defaultValue: true };
const variantFlag = {
  type: 'variant' as const,
  variants: ['control', 'bold', 'quiet'],
  defaultValue: 'control',
};

describe('targeting helpers', () => {
  it('offers only the values a flag takes', () => {
    expect(valuesOf(booleanFlag)).toEqual([true, false]);
    expect(valuesOf(variantFlag)).toEqual(['control', 'bold', 'quiet']);
  });

  // Off means off: a kill switch whose default is true still serves false.
  it('knows what a switched-off flag serves', () => {
    expect(offValueOf(booleanFlag)).toBe(false);
    expect(offValueOf(variantFlag)).toBe('control');
  });

  it('turns a select value back into a boolean for a boolean flag', () => {
    expect(parseValue(booleanFlag, 'true')).toBe(true);
    expect(parseValue(booleanFlag, 'false')).toBe(false);
    expect(parseValue(variantFlag, 'bold')).toBe('bold');
  });

  it('splits evenly, and always to 100', () => {
    const split = evenSplit(variantFlag);
    expect('split' in split && split.split.reduce((sum, arm) => sum + arm.weight, 0)).toBe(100);
    expect('split' in split && describeSplit(split)).toBe('34% control / 33% bold / 33% quiet');
  });

  it('never reuses a rule id', () => {
    const rules = [
      { id: 'rule-2', conditions: [], serve: { value: true } },
      { id: 'rule-3', conditions: [], serve: { value: true } },
    ];
    expect(newRuleId(rules)).toBe('rule-4');
    expect(emptyRule(booleanFlag, []).id).toBe('rule-1');
  });

  it('reads values one per line or comma-separated, ignoring blanks', () => {
    expect(textToValues('org-1\n org-2 ,org-3\n\n')).toEqual(['org-1', 'org-2', 'org-3']);
  });
});
