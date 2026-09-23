import { AppError } from '@flama/backend-core';
import type { ConfigService } from '@nestjs/config';
import { None } from 'oxide.ts';
import { describe, expect, it, vi } from 'vitest';
import type { BillingCustomerRepositoryPort } from '../../../database/billing-customer.repository.port';
import type { SubscriptionRepositoryPort } from '../../../database/subscription.repository.port';
import type { PaymentGatewayPort } from '../../../infrastructure/payment-gateway.port';
import { CreateCheckoutCommand } from '../create-checkout.command';
import { CreateCheckoutCommandHandler } from '../create-checkout.command-handler';

function setup(priceIds: string[] | undefined) {
  const gateway = {
    createCustomer: vi.fn().mockResolvedValue('cus_1'),
    createCheckoutSession: vi.fn().mockResolvedValue('https://checkout.stripe.test/s'),
  } as unknown as PaymentGatewayPort;
  const customers = {
    findOneByUserId: vi.fn().mockResolvedValue(None),
    insert: vi.fn(),
  } as unknown as BillingCustomerRepositoryPort;
  const subscriptions = {
    findOneByUserId: vi.fn().mockResolvedValue(None),
  } as unknown as SubscriptionRepositoryPort;
  const config = {
    get: (key: string) => (key === 'stripe.priceIds' ? priceIds : undefined),
  } as ConfigService;
  const handler = new CreateCheckoutCommandHandler(gateway, customers, subscriptions, config);
  return { handler, gateway };
}

const checkout = (priceId: string) => new CreateCheckoutCommand({ userId: 'user_1', priceId });

describe('CreateCheckoutCommandHandler', () => {
  it('opens a session for a price the server offers', async () => {
    const { handler, gateway } = setup(['price_pro', 'price_team']);
    await expect(handler.execute(checkout('price_team'))).resolves.toBe(
      'https://checkout.stripe.test/s',
    );
    expect(gateway.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'price_team' }),
    );
  });

  it('refuses a price that is not on offer, before touching Stripe', async () => {
    // Stripe would accept any active Price in the account — a legacy plan, a
    // test price — so what is for sale is the server's call, not the caller's.
    const { handler, gateway } = setup(['price_pro']);
    const error = await handler.execute(checkout('price_legacy_cheap')).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('BILLING_009');
    expect(gateway.createCustomer).not.toHaveBeenCalled();
    expect(gateway.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('offers nothing until STRIPE_PRICE_IDS is set', async () => {
    const { handler, gateway } = setup(undefined);
    await expect(handler.execute(checkout('price_pro'))).rejects.toBeInstanceOf(AppError);
    expect(gateway.createCheckoutSession).not.toHaveBeenCalled();
  });
});
