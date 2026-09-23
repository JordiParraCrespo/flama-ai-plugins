import { Some } from 'oxide.ts';
import { describe, expect, it, vi } from 'vitest';
import type { BillingCustomerRepositoryPort } from '../../../database/billing-customer.repository.port';
import type { SubscriptionRepositoryPort } from '../../../database/subscription.repository.port';
import { SubscriptionEntity } from '../../../domain/subscription.entity';
import type {
  NormalizedSubscription,
  PaymentGatewayPort,
} from '../../../infrastructure/payment-gateway.port';
import { SubscriptionMapper } from '../../../subscription.mapper';
import { HandleStripeWebhookCommand } from '../handle-stripe-webhook.command';
import { HandleStripeWebhookCommandHandler } from '../handle-stripe-webhook.command-handler';

const at = (iso: string) => new Date(iso);

const event = (overrides: Partial<NormalizedSubscription>): NormalizedSubscription => ({
  stripeSubscriptionId: 'sub_1',
  stripeCustomerId: 'cus_1',
  stripePriceId: 'price_1',
  plan: 'Pro',
  unitAmount: 1000,
  currency: 'usd',
  interval: 'month',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  userId: 'user_1',
  eventCreatedAt: at('2026-01-02T00:00:00Z'),
  ...overrides,
});

function setup(data: NormalizedSubscription, saved: boolean) {
  const stored = SubscriptionEntity.createNew({
    userId: 'user_1',
    stripeSubscriptionId: 'sub_1',
    ...new SubscriptionMapper().toSyncProps(event({ eventCreatedAt: at('2026-01-01T00:00:00Z') })),
  });
  stored.clearEvents();
  const gateway = {
    constructEvent: vi.fn().mockReturnValue({ type: 'subscription.upsert', data }),
  } as unknown as PaymentGatewayPort;
  const subscriptions = {
    findOneByStripeId: vi.fn().mockResolvedValue(Some(stored)),
    saveIfNewer: vi.fn().mockResolvedValue(saved),
    save: vi.fn(),
  } as unknown as SubscriptionRepositoryPort;
  const customers = {
    findOneByStripeCustomerId: vi.fn().mockResolvedValue(Some({ userId: 'user_1' })),
  } as unknown as BillingCustomerRepositoryPort;
  const handler = new HandleStripeWebhookCommandHandler(
    gateway,
    subscriptions,
    customers,
    new SubscriptionMapper(),
  );
  return { handler, subscriptions };
}

const delivery = new HandleStripeWebhookCommand({
  payload: Buffer.from('{}'),
  signature: 'sig',
});

describe('HandleStripeWebhookCommandHandler', () => {
  it('writes a newer event through the conditional save, never the blind one', async () => {
    const { handler, subscriptions } = setup(event({ status: 'canceled' }), true);
    await handler.execute(delivery);
    expect(subscriptions.saveIfNewer).toHaveBeenCalledOnce();
    expect(subscriptions.save).not.toHaveBeenCalled();
  });

  it('accepts losing a race to a newer delivery without failing the webhook', async () => {
    // Both deliveries read the same row; the newer one committed first, so the
    // conditional write refuses this one. Stripe must still get a 2xx.
    const { handler, subscriptions } = setup(event({ status: 'past_due' }), false);
    await expect(handler.execute(delivery)).resolves.toBeUndefined();
    expect(subscriptions.saveIfNewer).toHaveBeenCalledOnce();
  });

  it('does not write an event older than the one it read', async () => {
    const { handler, subscriptions } = setup(
      event({ eventCreatedAt: at('2025-12-31T00:00:00Z') }),
      true,
    );
    await handler.execute(delivery);
    expect(subscriptions.saveIfNewer).not.toHaveBeenCalled();
  });
});
