/**
 * Background Jobs Scheduler
 * Uses setInterval for simplicity (no extra dependency needed).
 * Runs on server startup alongside the BullMQ notification queue.
 */

import { runTaskCheckerJob } from './task-checker.job';
import { runAiNudgeJob } from './ai-nudge.job';

const TASK_CHECKER_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes
const AI_NUDGE_INTERVAL_MS     = 2 * 60 * 60 * 1000; // 2 hours

let taskCheckerTimer: ReturnType<typeof setInterval> | null = null;
let aiNudgeTimer: ReturnType<typeof setInterval> | null = null;

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

  console.log('[Jobs] All background jobs started.');
}

export function stopJobs() {
  if (taskCheckerTimer) clearInterval(taskCheckerTimer);
  if (aiNudgeTimer) clearInterval(aiNudgeTimer);
  console.log('[Jobs] Background jobs stopped.');
}

// Keep legacy export so existing imports don't break
export const jobs = { status: 'running' };
