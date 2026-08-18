/**
 * Background Jobs Scheduler
 * Uses setInterval for simplicity (no extra dependency needed).
 * Runs on server startup alongside the BullMQ notification queue.
 */

import { runTaskCheckerJob } from './task-checker.job';
import { runTaskRecurrenceJob } from './task-recurrence.job';
import { runAiNudgeJob } from './ai-nudge.job';
import { runDailyCheckinJob } from './daily-checkin.job';
import { runLowStockJob } from './low-stock.job';
import { runVaccineDueJob } from './vaccine-due.job';
import { runSymptomFollowupJob } from './symptom-followup.job';
import { runWeeklyReportJob } from './weekly-report.job';
import { runPhotoCheckinJob } from './photo-checkin.job';
import { runWeatherAdvisoryJob } from './weather-advisory.job';
import { runMilestonesJob } from './milestones.job';
import { runVetPrepJob } from './vet-prep.job';
import { runRevenueCatReconcileJob } from './revenuecat-reconcile.job';
import { runAbandonedCartJob } from './abandoned-cart.job';
import { startSubscriptionRunner } from '@/modules/shop/jobs/subscription-runner';

const TASK_CHECKER_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes
const AI_NUDGE_INTERVAL_MS     = 2 * 60 * 60 * 1000; // 2 hours
const DAILY_CHECKIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LOW_STOCK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const VACCINE_DUE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const TASK_RECURRENCE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * The care-intelligence jobs.
 *
 * All of them tick hourly and gate themselves on the user's own clock (and
 * their own send-once caps), rather than each owning a bespoke cadence here.
 * The exception is milestones, which move on the scale of weeks.
 */
const SYMPTOM_FOLLOWUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const WEEKLY_REPORT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PHOTO_CHECKIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const WEATHER_ADVISORY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const VET_PREP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MILESTONES_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Catch RevenueCat subscriptions whose period lapsed without an EXPIRATION
 * webhook. Hourly is frequent enough: entitlement is already correct the
 * moment the period ends (see subscriptions/model.ts), this only tidies the
 * stored status behind it.
 */
const REVENUECAT_RECONCILE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Abandoned-cart recovery. Hourly is the finest cadence that makes sense: the
 * rules themselves are configured in hours, and the job dedupes on cart
 * contents, so ticking more often would only re-scan the same carts.
 */
const ABANDONED_CART_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let taskCheckerTimer: ReturnType<typeof setInterval> | null = null;
let aiNudgeTimer: ReturnType<typeof setInterval> | null = null;
let dailyCheckinTimer: ReturnType<typeof setInterval> | null = null;
let lowStockTimer: ReturnType<typeof setInterval> | null = null;
let vaccineDueTimer: ReturnType<typeof setInterval> | null = null;
let taskRecurrenceTimer: ReturnType<typeof setInterval> | null = null;
let subscriptionTimer: ReturnType<typeof setInterval> | null = null;
let symptomFollowupTimer: ReturnType<typeof setInterval> | null = null;
let weeklyReportTimer: ReturnType<typeof setInterval> | null = null;
let photoCheckinTimer: ReturnType<typeof setInterval> | null = null;
let weatherAdvisoryTimer: ReturnType<typeof setInterval> | null = null;
let vetPrepTimer: ReturnType<typeof setInterval> | null = null;
let milestonesTimer: ReturnType<typeof setInterval> | null = null;
let revenueCatReconcileTimer: ReturnType<typeof setInterval> | null = null;
let abandonedCartTimer: ReturnType<typeof setInterval> | null = null;

export function startJobs() {
  console.log('[Jobs] Starting background jobs...');

  // Run immediately on startup, then on interval
  runTaskCheckerJob()
    .then((r) => console.log('[Jobs] task-checker initial run:', r))
    .catch((e) => console.error('[Jobs] task-checker error:', e));

  taskCheckerTimer = setInterval(async () => {
    try {
      const result = await runTaskCheckerJob();
      if (result.handedOff > 0) {
        console.log(`[Jobs] task-checker: handed ${result.handedOff} of ${result.checked} overdue tasks to the AI`);
      }
    } catch (err) {
      console.error('[Jobs] task-checker error:', err);
    }
  }, TASK_CHECKER_INTERVAL_MS);

  aiNudgeTimer = setInterval(async () => {
    try {
      const result = await runAiNudgeJob();
      if (result.nudged > 0) {
        console.log(`[Jobs] ai-nudge: sent ${result.nudged} proactive messages`);
      }
    } catch (err) {
      console.error('[Jobs] ai-nudge error:', err);
    }
  }, AI_NUDGE_INTERVAL_MS);

  // Daily check-in: hourly tick (no immediate startup run, so restarts don't
  // re-trigger). Each user is checked in at most once per day on their hour.
  dailyCheckinTimer = setInterval(async () => {
    try {
      const result = await runDailyCheckinJob();
      if (result.checkedIn > 0) {
        console.log(`[Jobs] daily-checkin: sent ${result.checkedIn} proactive check-ins`);
      }
    } catch (err) {
      console.error('[Jobs] daily-checkin error:', err);
    }
  }, DAILY_CHECKIN_INTERVAL_MS);

  // Low-stock alert: hourly tick (no immediate startup run).
  lowStockTimer = setInterval(async () => {
    try {
      const result = await runLowStockJob();
      if (result.alerted > 0 || result.autoOrdered > 0) {
        console.log(`[Jobs] low-stock: ${result.alerted} alerts, ${result.autoOrdered} auto-orders`);
      }
    } catch (err) {
      console.error('[Jobs] low-stock error:', err);
    }
  }, LOW_STOCK_INTERVAL_MS);

  // Vaccine-due alert: hourly tick (no immediate startup run).
  vaccineDueTimer = setInterval(async () => {
    try {
      const result = await runVaccineDueJob();
      if (result.reminded > 0) {
        console.log(`[Jobs] vaccine-due: ${result.reminded} reminders`);
      }
    } catch (err) {
      console.error('[Jobs] vaccine-due error:', err);
    }
  }, VACCINE_DUE_INTERVAL_MS);

  // Recurring tasks: roll missed daily/weekly items to their next slot so a
  // care plan keeps running instead of dying on the first missed day. Runs on
  // startup too — a restart after downtime should catch the schedule up.
  runTaskRecurrenceJob()
    .then((r) => console.log('[Jobs] task-recurrence initial run:', r))
    .catch((e) => console.error('[Jobs] task-recurrence error:', e));

  taskRecurrenceTimer = setInterval(async () => {
    try {
      const result = await runTaskRecurrenceJob();
      if (result.rolled > 0) {
        console.log(`[Jobs] task-recurrence: rolled ${result.rolled} of ${result.checked} recurring tasks`);
      }
    } catch (err) {
      console.error('[Jobs] task-recurrence error:', err);
    }
  }, TASK_RECURRENCE_INTERVAL_MS);

  // ── Care intelligence ───────────────────────────────────────────────────
  // None of these run on startup: a redeploy must never produce a burst of
  // proactive messages. They wait for their first tick like everything else
  // that talks to a user unprompted.

  symptomFollowupTimer = setInterval(async () => {
    try {
      const result = await runSymptomFollowupJob();
      if (result.followedUp > 0) {
        console.log(`[Jobs] symptom-followup: ${result.followedUp} follow-ups`);
      }
    } catch (err) {
      console.error('[Jobs] symptom-followup error:', err);
    }
  }, SYMPTOM_FOLLOWUP_INTERVAL_MS);

  weeklyReportTimer = setInterval(async () => {
    try {
      const result = await runWeeklyReportJob();
      if (result.sent > 0) console.log(`[Jobs] weekly-report: ${result.sent} reports`);
    } catch (err) {
      console.error('[Jobs] weekly-report error:', err);
    }
  }, WEEKLY_REPORT_INTERVAL_MS);

  photoCheckinTimer = setInterval(async () => {
    try {
      const result = await runPhotoCheckinJob();
      if (result.asked > 0) console.log(`[Jobs] photo-checkin: ${result.asked} asked`);
    } catch (err) {
      console.error('[Jobs] photo-checkin error:', err);
    }
  }, PHOTO_CHECKIN_INTERVAL_MS);

  weatherAdvisoryTimer = setInterval(async () => {
    try {
      const result = await runWeatherAdvisoryJob();
      if (result.advised > 0) console.log(`[Jobs] weather-advisory: ${result.advised} advisories`);
    } catch (err) {
      console.error('[Jobs] weather-advisory error:', err);
    }
  }, WEATHER_ADVISORY_INTERVAL_MS);

  vetPrepTimer = setInterval(async () => {
    try {
      const result = await runVetPrepJob();
      if (result.prepared > 0) console.log(`[Jobs] vet-prep: ${result.prepared} prep notes`);
    } catch (err) {
      console.error('[Jobs] vet-prep error:', err);
    }
  }, VET_PREP_INTERVAL_MS);

  milestonesTimer = setInterval(async () => {
    try {
      const result = await runMilestonesJob();
      if (result.created > 0) console.log(`[Jobs] milestones: ${result.created} created`);
    } catch (err) {
      console.error('[Jobs] milestones error:', err);
    }
  }, MILESTONES_INTERVAL_MS);

  revenueCatReconcileTimer = setInterval(async () => {
    try {
      const result = await runRevenueCatReconcileJob();
      if (result.reconciled > 0 || result.failed > 0) {
        console.log(`[Jobs] revenuecat-reconcile: ${result.reconciled} reconciled, ${result.failed} failed`);
      }
    } catch (err) {
      console.error('[Jobs] revenuecat-reconcile error:', err);
    }
  }, REVENUECAT_RECONCILE_INTERVAL_MS);

  // No startup run: a redeploy must not fire a burst of recovery emails.
  abandonedCartTimer = setInterval(async () => {
    try {
      const result = await runAbandonedCartJob();
      if (result.sent > 0 || result.recovered > 0) {
        console.log(`[Jobs] abandoned-cart: ${result.sent} sent, ${result.recovered} recovered`);
      }
    } catch (err) {
      console.error('[Jobs] abandoned-cart error:', err);
    }
  }, ABANDONED_CART_INTERVAL_MS);

  /**
   * "Subscribe & save" recurring orders.
   *
   * shop-service started this itself from its own entry point. With the shop
   * merged in there is no separate process to start it, so it joins the rest of
   * the scheduler here. It owns its own cadence (`SUBSCRIPTION_TICK_MS`,
   * hourly by default) and its own 10s startup delay, so it is started rather
   * than driven by an interval declared above.
   */
  subscriptionTimer = startSubscriptionRunner();

  console.log('[Jobs] All background jobs started.');
}

export function stopJobs() {
  if (taskCheckerTimer) clearInterval(taskCheckerTimer);
  if (aiNudgeTimer) clearInterval(aiNudgeTimer);
  if (dailyCheckinTimer) clearInterval(dailyCheckinTimer);
  if (lowStockTimer) clearInterval(lowStockTimer);
  if (vaccineDueTimer) clearInterval(vaccineDueTimer);
  if (taskRecurrenceTimer) clearInterval(taskRecurrenceTimer);
  if (subscriptionTimer) clearInterval(subscriptionTimer);
  if (symptomFollowupTimer) clearInterval(symptomFollowupTimer);
  if (weeklyReportTimer) clearInterval(weeklyReportTimer);
  if (photoCheckinTimer) clearInterval(photoCheckinTimer);
  if (weatherAdvisoryTimer) clearInterval(weatherAdvisoryTimer);
  if (vetPrepTimer) clearInterval(vetPrepTimer);
  if (milestonesTimer) clearInterval(milestonesTimer);
  if (revenueCatReconcileTimer) clearInterval(revenueCatReconcileTimer);
  if (abandonedCartTimer) clearInterval(abandonedCartTimer);
  console.log('[Jobs] Background jobs stopped.');
}

// Keep legacy export so existing imports don't break
export const jobs = { status: 'running' };
