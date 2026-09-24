import type { FeatureFlag } from '@flama/frontend-admin';
import type {
  FlagAttribute,
  FlagCondition,
  FlagOperator,
  FlagRule,
  FlagServe,
  FlagValue,
} from '@flama/shared';

/**
 * The values a flag may serve, as the targeting form offers them: `true` and
 * `false` for a boolean flag, its declared variants for a multivariate one.
 * The API refuses anything else; offering only these means it never has to.
 */
export function valuesOf(flag: Pick<FeatureFlag, 'type' | 'variants'>): FlagValue[] {
  return flag.type === 'boolean' ? [true, false] : flag.variants;
}

/** What a switched-off flag serves — see `offValueOf` in `@flama/shared`. */
export function offValueOf(flag: Pick<FeatureFlag, 'type' | 'defaultValue'>): FlagValue {
  return flag.type === 'boolean' ? false : flag.defaultValue;
}

/** A value as the table and the dialogs print it. */
export function formatValue(value: FlagValue): string {
  return String(value);
}

/**
 * A `Select` hands back strings; a boolean flag's `"true"` has to go back to
 * the API as `true`, or it fails validation as a value the flag does not take.
 */
export function parseValue(flag: Pick<FeatureFlag, 'type'>, raw: string): FlagValue {
  return flag.type === 'boolean' ? raw === 'true' : raw;
}

/** A short, readable rule id, unique enough within one flag. */
export function newRuleId(existing: readonly FlagRule[]): string {
  const taken = new Set(existing.map((rule) => rule.id));
  let index = existing.length + 1;
  while (taken.has(`rule-${index}`)) index += 1;
  return `rule-${index}`;
}

/**
 * The operators that mean something for an attribute, as the evaluator reads
 * them: a version compares, an email may match a domain, everything else is
 * membership. Offering the rest would save a condition that never matches.
 */
export function operatorsFor(attribute: FlagAttribute): FlagOperator[] {
  if (attribute === 'appVersion') return ['semver_gte', 'semver_lt', 'in', 'not_in'];
  if (attribute === 'email') return ['in', 'not_in', 'ends_with'];
  return ['in', 'not_in'];
}

export function emptyCondition(): FlagCondition {
  return { attribute: 'organizationId', operator: 'in', values: [] };
}

export function emptyRule(
  flag: Pick<FeatureFlag, 'type' | 'variants'>,
  existing: readonly FlagRule[],
): FlagRule {
  return {
    id: newRuleId(existing),
    conditions: [emptyCondition()],
    serve: { value: valuesOf(flag)[0] as FlagValue },
  };
}

/** An even split across every value the flag takes. */
export function evenSplit(flag: Pick<FeatureFlag, 'type' | 'variants'>): FlagServe {
  const values = valuesOf(flag);
  const base = Math.floor(100 / values.length);
  return {
    split: values.map((value, index) => ({
      value,
      // The remainder goes on the first arm so the weights always sum to 100.
      weight: index === 0 ? 100 - base * (values.length - 1) : base,
    })),
  };
}

/** `50% true / 50% false`. */
export function describeSplit(serve: Extract<FlagServe, { split: unknown }>): string {
  return serve.split.map((arm) => `${arm.weight}% ${formatValue(arm.value)}`).join(' / ');
}

/** Values text (one per line) ↔ the array a condition stores. */
export function valuesToText(values: readonly string[]): string {
  return values.join('\n');
}

export function textToValues(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
