/**
 * seed-subscription-plans.ts
 * --------------------------
 * Seed the three default subscription tiers (Free / Standard / Premium) from
 * the catalog's DEFAULT_PLANS. Idempotent: upserts by plan name, so re-running
 * refreshes feature flags / limits / price without creating duplicates.
 *
 * Usage:
 *   bun run scripts/seed-subscription-plans.ts
 */

import { eq } from 'drizzle-orm';
import { db } from '../src/shared/db';
import { subscriptionPlans } from '../src/shared/db/schema';
import { DEFAULT_PLANS } from '../src/modules/subscriptions/catalog';

async function main() {
  console.log('\n→ Seeding default subscription plans…\n');

  for (const plan of DEFAULT_PLANS) {
    const [existing] = await db
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, plan.name))
      .limit(1);

    const values = {
      name: plan.name,
      description: plan.description,
      price: String(plan.price),
      billingCycle: 'monthly',
      featureFlags: plan.featureFlags,
      limits: plan.limits,
      isActive: true,
      sortOrder: String(plan.sortOrder),
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(subscriptionPlans).set(values).where(eq(subscriptionPlans.id, existing.id));
      console.log(`  ✓ updated  ${plan.name}`);
    } else {
      await db.insert(subscriptionPlans).values(values);
      console.log(`  ✓ created  ${plan.name}`);
    }
  }

  console.log('\n✅ Done.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err?.message ?? err);
  process.exit(1);
});
