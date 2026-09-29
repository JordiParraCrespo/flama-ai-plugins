import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { resolveCapabilities } from '../capabilities.module';

function configWith(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('stripe_billing', () => {
  it('is on with the secret key alone', () => {
    expect(resolveCapabilities(configWith({})).stripe_billing).toBe(false);
    expect(resolveCapabilities(configWith({ 'stripe.secretKey': 'sk_test' })).stripe_billing).toBe(
      true,
    );
  });
});
