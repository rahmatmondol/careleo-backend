/**
 * Subscription coverage — decides which shop cart lines the user's plan pays
 * for ("monthly food supply", roadmap §3).
 *
 * The model is budget-first: a plan grants a `monthly_food_budget` and
 * `plan_coverage_rules` say what that budget may be spent on. A line can be
 * *partially* covered — 3 of 5 units when the budget runs out mid-line — which
 * is friendlier than rejecting the whole line, and is why coverage is tracked
 * in units as well as money.
 *
 * Two callers share this:
 *   - the cart quote (read-only preview the app renders)
 *   - checkout (inside the order transaction, with the usage row locked)
 *
 * The quote is never trusted at checkout. Coverage is always recomputed under
 * the lock, because the budget can move between the two calls — another device,
 * a scheduled re-order, or a plan change.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { db } from '@/shared/db';
import { planCoverageRules, subscriptionBenefitUsage, userSubscriptions } from '@/shared/db/schema';
import { resolveEntitlement } from './entitlements';

/**
 * `db` or a transaction handle — coverage runs in both, and only the
 * transaction may take the row lock. Typed as the base both extend; neither
 * `NodePgDatabase` nor `PgTransaction` is assignable to the other.
 */
export type Executor = PgDatabase<PgQueryResultHKT, any, any>;

/** A cart line as the shop hands it over. */
export type CoverageInput = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  categoryId: string | null;
  /** `products.subscriptionIncluded` — the catalogue-level opt-in. */
  subscriptionIncluded: boolean;
};

export type CoverageReason =
  | 'covered'
  | 'partial'
  | 'no_benefit'
  | 'not_eligible'
  | 'budget_exhausted'
  | 'qty_limit';

export type CoverageLine = CoverageInput & {
  coveredQuantity: number;
  coveredAmount: number;
  payableAmount: number;
  lineTotal: number;
  reason: CoverageReason;
};

export type BenefitSummary = {
  planName: string;
  budget: number;
  used: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date | null;
};

export type CoverageResult = {
  lines: CoverageLine[];
  subtotal: number;
  coveredTotal: number;
  payableTotal: number;
  /** null when the plan grants no food supply benefit at all. */
  benefit: BenefitSummary | null;
  /** Units drawn per coverage rule — what `commitUsage` must record. */
  qtyByRule: Record<string, number>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Everything payable — used when the user has no benefit to apply. */
const uncovered = (lines: CoverageInput[], reason: CoverageReason): CoverageResult => {
  const mapped = lines.map((l) => {
    const lineTotal = round2(l.unitPrice * l.quantity);
    return {
      ...l,
      coveredQuantity: 0,
      coveredAmount: 0,
      payableAmount: lineTotal,
      lineTotal,
      reason,
    };
  });
  const subtotal = round2(mapped.reduce((sum, l) => sum + l.lineTotal, 0));
  return { lines: mapped, subtotal, coveredTotal: 0, payableTotal: subtotal, benefit: null, qtyByRule: {} };
};

/**
 * Load (and optionally lock) the usage row for the user's current period.
 *
 * `lock: true` must only be used inside a transaction — it takes
 * `SELECT … FOR UPDATE` so two concurrent checkouts cannot both spend the same
 * remaining budget. The row is created on demand at commit time, so a user who
 * has never used the benefit simply reads as zero here.
 */
const readUsage = async (
  exec: Executor,
  userId: string,
  periodStart: Date,
  periodEnd: Date | null,
  lock: boolean,
): Promise<{ amountUsed: number; qtyUsed: Record<string, number> }> => {
  if (lock) {
    // `FOR UPDATE` locks rows, not gaps — with no row yet, two concurrent
    // first-ever checkouts of a period would both read zero and both be
    // covered. Materialising the row first gives them something to serialise
    // on. Idempotent, so the loser of the race simply proceeds to the lock.
    await exec
      .insert(subscriptionBenefitUsage)
      .values({ userId, periodStart, periodEnd, amountUsed: '0', qtyUsedJson: {} })
      .onConflictDoNothing();
  }

  const base = exec
    .select({
      amountUsed: subscriptionBenefitUsage.amountUsed,
      qtyUsedJson: subscriptionBenefitUsage.qtyUsedJson,
    })
    .from(subscriptionBenefitUsage)
    .where(
      and(
        eq(subscriptionBenefitUsage.userId, userId),
        eq(subscriptionBenefitUsage.periodStart, periodStart),
      ),
    );

  const rows = await (lock ? base.for('update') : base);
  const row = rows[0];
  return {
    amountUsed: Number(row?.amountUsed ?? 0),
    qtyUsed: (row?.qtyUsedJson as Record<string, number> | undefined) ?? {},
  };
};

/**
 * Resolve how much of `lines` the user's subscription covers.
 *
 * Lines are considered in the order given — the order the user sees in their
 * cart — so a partially-covered cart is explainable rather than depending on a
 * hidden sort.
 */
export const resolveCoverage = async (
  userId: string,
  lines: CoverageInput[],
  opts: { exec?: Executor; lock?: boolean } = {},
): Promise<CoverageResult> => {
  const exec = opts.exec ?? db;
  if (!lines.length) {
    return { lines: [], subtotal: 0, coveredTotal: 0, payableTotal: 0, benefit: null, qtyByRule: {} };
  }

  const entitlement = await resolveEntitlement(userId);
  if (entitlement.featureFlags.monthly_food_supply !== true) return uncovered(lines, 'no_benefit');
  // The Free fallback has no plan row, so there are no coverage rules to look
  // up — and querying `plan_id = ''` against a uuid column would error.
  if (!entitlement.planId) return uncovered(lines, 'no_benefit');

  const budget = Number(entitlement.limits.monthly_food_budget ?? 0);
  if (!Number.isFinite(budget) || budget <= 0) return uncovered(lines, 'no_benefit');

  // The benefit period is the subscription's, not the calendar month, so a
  // plan bought on the 20th still gets a full period of supply.
  const [sub] = await exec
    .select({
      periodStart: userSubscriptions.currentPeriodStart,
      periodEnd: userSubscriptions.currentPeriodEnd,
    })
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, 'active')))
    .limit(1);
  if (!sub) return uncovered(lines, 'no_benefit');

  const rules = await exec
    .select()
    .from(planCoverageRules)
    .where(eq(planCoverageRules.planId, entitlement.planId));
  // A plan with a budget but no rules covers nothing: fail closed rather than
  // silently giving away the whole catalogue.
  if (!rules.length) return uncovered(lines, 'not_eligible');

  const productRules = new Map(rules.filter((r) => r.scope === 'product').map((r) => [r.refId, r]));
  const categoryRules = new Map(rules.filter((r) => r.scope === 'category').map((r) => [r.refId, r]));

  const { amountUsed, qtyUsed } = await readUsage(
    exec,
    userId,
    sub.periodStart,
    sub.periodEnd,
    opts.lock === true,
  );
  let remaining = round2(Math.max(0, budget - amountUsed));

  const qtyByRule: Record<string, number> = {};
  const out: CoverageLine[] = [];

  for (const line of lines) {
    const lineTotal = round2(line.unitPrice * line.quantity);
    const push = (coveredQuantity: number, reason: CoverageReason) => {
      const coveredAmount = round2(line.unitPrice * coveredQuantity);
      out.push({
        ...line,
        coveredQuantity,
        coveredAmount,
        payableAmount: round2(lineTotal - coveredAmount),
        lineTotal,
        reason,
      });
    };

    // Two switches must agree: the product has to be marked as subscription
    // stock at all, and the user's plan has to cover it. A product rule beats a
    // category rule — the specific one wins.
    const rule = productRules.get(line.productId) ?? (line.categoryId ? categoryRules.get(line.categoryId) : undefined);
    if (!line.subscriptionIncluded || !rule) {
      push(0, 'not_eligible');
      continue;
    }

    if (remaining <= 0) {
      push(0, 'budget_exhausted');
      continue;
    }

    // Free products would divide by zero below; treat them as fully covered.
    const affordableQty =
      line.unitPrice > 0 ? Math.floor(remaining / line.unitPrice) : line.quantity;

    const alreadyUsedQty = (qtyUsed[rule.id] ?? 0) + (qtyByRule[rule.id] ?? 0);
    const qtyCap =
      rule.monthlyQtyLimit === null || rule.monthlyQtyLimit === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number(rule.monthlyQtyLimit) - alreadyUsedQty);

    const coveredQuantity = Math.max(0, Math.min(line.quantity, affordableQty, qtyCap));
    if (coveredQuantity <= 0) {
      push(0, qtyCap <= 0 ? 'qty_limit' : 'budget_exhausted');
      continue;
    }

    const coveredAmount = round2(line.unitPrice * coveredQuantity);
    remaining = round2(remaining - coveredAmount);
    qtyByRule[rule.id] = (qtyByRule[rule.id] ?? 0) + coveredQuantity;

    push(coveredQuantity, coveredQuantity === line.quantity ? 'covered' : 'partial');
  }

  const subtotal = round2(out.reduce((sum, l) => sum + l.lineTotal, 0));
  const coveredTotal = round2(out.reduce((sum, l) => sum + l.coveredAmount, 0));

  return {
    lines: out,
    subtotal,
    coveredTotal,
    payableTotal: round2(subtotal - coveredTotal),
    benefit: {
      planName: entitlement.planName,
      budget,
      used: round2(amountUsed + coveredTotal),
      remaining,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
    },
    qtyByRule,
  };
};

/**
 * Record benefit spend. Must run in the same transaction as the order insert,
 * after `resolveCoverage(..., { lock: true })`.
 */
export const commitUsage = async (
  exec: Executor,
  userId: string,
  periodStart: Date,
  periodEnd: Date | null,
  amount: number,
  qtyByRule: Record<string, number>,
): Promise<void> => {
  if (amount <= 0 && !Object.keys(qtyByRule).length) return;

  await exec
    .insert(subscriptionBenefitUsage)
    .values({
      userId,
      periodStart,
      periodEnd,
      amountUsed: String(round2(amount)),
      qtyUsedJson: qtyByRule,
    })
    .onConflictDoUpdate({
      target: [subscriptionBenefitUsage.userId, subscriptionBenefitUsage.periodStart],
      set: {
        amountUsed: sql`${subscriptionBenefitUsage.amountUsed} + ${String(round2(amount))}`,
        // Merge the per-rule counters server-side so a concurrent writer's
        // units are never overwritten by a stale read.
        qtyUsedJson: sql`(
          SELECT COALESCE(jsonb_object_agg(key, total), '{}'::jsonb)
          FROM (
            SELECT key, SUM(value::numeric)::int AS total
            FROM (
              SELECT * FROM jsonb_each_text(${subscriptionBenefitUsage.qtyUsedJson})
              UNION ALL
              SELECT * FROM jsonb_each_text(${JSON.stringify(qtyByRule)}::jsonb)
            ) merged
            GROUP BY key
          ) summed
        )`,
        updatedAt: new Date(),
      },
    });
};

/**
 * Give benefit back — an order that consumed budget was cancelled.
 *
 * Credits the period the order actually drew from (orders carry
 * `benefitPeriodStart`), never simply "the current period", which could be a
 * later one by the time a cancellation arrives. Clamped at zero so a double
 * cancellation cannot mint budget.
 */
export const releaseUsage = async (
  exec: Executor,
  userId: string,
  periodStart: Date,
  amount: number,
  qtyByRule: Record<string, number> = {},
): Promise<void> => {
  if (amount <= 0 && !Object.keys(qtyByRule).length) return;

  await exec
    .update(subscriptionBenefitUsage)
    .set({
      amountUsed: sql`GREATEST(0, ${subscriptionBenefitUsage.amountUsed} - ${String(round2(amount))})`,
      qtyUsedJson: sql`(
        SELECT COALESCE(jsonb_object_agg(key, total), '{}'::jsonb)
        FROM (
          SELECT key, GREATEST(0, SUM(value::numeric))::int AS total
          FROM (
            SELECT * FROM jsonb_each_text(${subscriptionBenefitUsage.qtyUsedJson})
            UNION ALL
            SELECT key, (-1 * value::numeric)::text AS value
            FROM jsonb_each_text(${JSON.stringify(qtyByRule)}::jsonb)
          ) merged
          GROUP BY key
        ) summed
      )`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscriptionBenefitUsage.userId, userId),
        eq(subscriptionBenefitUsage.periodStart, periodStart),
      ),
    );
};
