import { revenueCatConfig } from '@/modules/subscriptions/revenuecat/config';
import { RevenueCatModel } from '@/modules/subscriptions/revenuecat/model';
import { RevenueCatService } from '@/modules/subscriptions/revenuecat/service';

/**
 * Repair subscriptions whose RevenueCat period has lapsed without an
 * EXPIRATION webhook arriving.
 *
 * Access is already correct without this — `getActiveSubscription` refuses a
 * row whose period has ended, so a missed webhook never leaves a user on a
 * plan they stopped paying for. What it leaves wrong is the *record*: the row
 * still says `active`, so the admin panel, support and any revenue reporting
 * built on `status` see a subscriber who is not one. This asks RevenueCat what
 * actually happened and writes it down — usually an expiry, occasionally a
 * renewal whose webhook was the one that went missing.
 *
 * Batched and rate-limited on purpose: a store-wide renewal failure could make
 * thousands of rows lapse at once, and hammering RevenueCat's API in that
 * moment is the wrong response.
 */

const BATCH_SIZE = 100;
const DELAY_BETWEEN_CALLS_MS = 100;

export type RevenueCatReconcileResult = {
  checked: number;
  reconciled: number;
  failed: number;
  skipped?: string;
};

export const runRevenueCatReconcileJob = async (): Promise<RevenueCatReconcileResult> => {
  if (!revenueCatConfig.isRestConfigured()) {
    return { checked: 0, reconciled: 0, failed: 0, skipped: 'REVENUECAT_SECRET_API_KEY is not set' };
  }

  const lapsed = await RevenueCatModel.findLapsed(BATCH_SIZE);
  let reconciled = 0;
  let failed = 0;

  for (const sub of lapsed) {
    try {
      await RevenueCatService.syncUser(sub.userId);
      reconciled += 1;
    } catch (err) {
      // One customer RevenueCat cannot answer for must not stop the batch;
      // the row stays lapsed and is picked up on the next tick.
      failed += 1;
      console.error(`[Jobs] revenuecat-reconcile: user ${sub.userId} failed:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));
  }

  return { checked: lapsed.length, reconciled, failed };
};
