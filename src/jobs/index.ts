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
import { startSubscriptionRunner } from '@/modules/shop/jobs/subscription-runner';

const TASK_CHECKER_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes
const AI_NUDGE_INTERVAL_MS     = 2 * 60 * 60 * 1000; // 2 hours
const DAILY_CHECKIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LOW_STOCK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const VACCINE_DUE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const TASK_RECURRENCE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let taskCheckerTimer: ReturnType<typeof setInterval> | null = null;
let aiNudgeTimer: ReturnType<typeof setInterval> | null = null;
let dailyCheckinTimer: ReturnType<typeof setInterval> | null = null;
let lowStockTimer: ReturnType<typeof setInterval> | null = null;
let vaccineDueTimer: ReturnType<typeof setInterval> | null = null;
let taskRecurrenceTimer: ReturnType<typeof setInterval> | null = null;
let subscriptionTimer: ReturnType<typeof setInterval> | null = null;

export function startJobs() {
  console.log('[Jobs] Starting background jobs...');

  // Run immediately on startup, then on interval
  runTaskCheckerJob()
    .then((r) => console.log('[Jobs] task-checker initial run:', r))
    .catch((e) => console.error('[Jobs] task-checker error:', e));

  taskCheckerTimer = setInterval(async () => {
    try {
      const result = await runTaskCheckerJob();
      if (result.notified > 0) {
        console.log(`[Jobs] task-checker: notified ${result.notified} of ${result.checked} overdue tasks`);
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
  console.log('[Jobs] Background jobs stopped.');
}

// Keep legacy export so existing imports don't break
export const jobs = { status: 'running' };
