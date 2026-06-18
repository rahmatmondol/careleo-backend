/**
 * AI Tool Implementations
 * These functions are called when Gemini uses Function Calling.
 * Each tool maps to a real backend action.
 */

import { TasksService } from '../tasks/service';
import { RemindersService } from '../reminders/service';
import { NotificationsService } from '../notifications/service';
import { CarePlanService } from './care-plan';
import { AiModel } from './model';
import { WooCommerceService } from '@/modules/integrations/woocommerce/service';
import { PetProfileService } from '@/modules/pet-profile/service';
import { can } from '@/modules/subscriptions/entitlements';
import type { FeatureKey } from '@/modules/subscriptions/catalog';

// ─── Gemini Function Declarations ─────────────────────────────────────────
// These are passed to the model so it knows what tools it can call.

export const AI_TOOL_DECLARATIONS = [
  // ── Task tools ──────────────────────────────────────────────────────────
  {
    name: 'create_task',
    description: 'Create a new care task for a pet (feeding, walk, medicine, grooming, etc.)',
    parameters: {
      type: 'object',
      properties: {
        petId:     { type: 'string', description: 'The pet ID to create the task for' },
        title:     { type: 'string', description: 'Task title e.g. "Buddy morning walk"' },
        taskType:  { type: 'string', description: 'One of: FEEDING, EXERCISE, MEDICINE, GROOMING, VET_VISIT, OTHER' },
        dueDate:   { type: 'string', description: 'ISO date-time string for when the task is due' },
        frequency: { type: 'string', description: 'One of: daily, weekly, monthly, none' },
        notes:     { type: 'string', description: 'Optional notes or instructions' },
      },
      required: ['petId', 'title'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to mark as completed' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'get_upcoming_tasks',
    description: "Get a pet's upcoming or pending tasks",
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID' },
      },
      required: ['petId'],
    },
  },
  // ── Reminder tools ──────────────────────────────────────────────────────
  {
    name: 'set_reminder',
    description: 'Set a reminder for a pet care activity',
    parameters: {
      type: 'object',
      properties: {
        petId:        { type: 'string', description: 'The pet ID' },
        title:        { type: 'string', description: 'Reminder title' },
        reminderTime: { type: 'string', description: 'ISO date-time for the reminder' },
        frequency:    { type: 'string', description: 'One of: Everyday, Weekly, Monthly, Once' },
        notes:        { type: 'string', description: 'Optional notes' },
      },
      required: ['petId', 'title', 'reminderTime'],
    },
  },
  {
    name: 'list_reminders',
    description: "List all active reminders for the user's pets",
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // ── Pet info tools ──────────────────────────────────────────────────────
  {
    name: 'get_pet_info',
    description: 'Get detailed profile and health information for a specific pet',
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID' },
      },
      required: ['petId'],
    },
  },
  {
    name: 'get_all_pets',
    description: "Get a list of all pets belonging to the user",
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // ── Store tools ─────────────────────────────────────────────────────────
  {
    name: 'search_products',
    description: 'Search the Careleo store for pet products (food, toys, medicine, accessories)',
    parameters: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Search query e.g. "weight management large breed dog food"' },
        category: { type: 'string', description: 'Optional category filter: food, toy, medicine, accessory, supplement' },
        petType:  { type: 'string', description: 'Optional: dog, cat, bird, etc.' },
      },
      required: ['query'],
    },
  },
  // ── Care plan tools ──────────────────────────────────────────────────────
  {
    name: 'get_care_plan',
    description: "Get the current AI-generated care plan for a pet",
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID' },
      },
      required: ['petId'],
    },
  },
  {
    name: 'regenerate_care_plan',
    description: 'Regenerate and update the care plan for a pet based on latest data',
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID' },
      },
      required: ['petId'],
    },
  },
  // ── Notification tools ───────────────────────────────────────────────────
  {
    name: 'send_notification',
    description: 'Send a push notification to the user',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        body:  { type: 'string', description: 'Notification message body' },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'save_pet_fact',
    description:
      "Save a durable fact you learned about a pet to its long-term profile (diet, health, allergy, activity, behavior, or preference). Use this when the user shares lasting information about their pet so you remember it later.",
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID this fact is about' },
        fact: { type: 'string', description: 'A concise statement of the fact, e.g. "Allergic to chicken"' },
        category: {
          type: 'string',
          description: 'One of: diet, health, activity, behavior, preference, other',
        },
      },
      required: ['petId', 'fact'],
    },
  },
];

// ─── Tier gating ───────────────────────────────────────────────────────────
// Maps a tool to the subscription feature it requires. Tools not listed here
// are available on every tier (the AI's baseline abilities). When a user's
// plan lacks the feature, the tool is not executed; the AI receives a polite
// "not on your plan" result instead so it can suggest an upgrade.
const TOOL_REQUIRED_FEATURE: Partial<Record<string, FeatureKey>> = {
  search_products: 'product_recommend',
  save_pet_fact: 'pet_profiling',
};

// ─── Tool Executor ─────────────────────────────────────────────────────────
// Called with the function name + args from Gemini's response.

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
): Promise<string> {
  try {
    // Tier gate: block tools whose feature is not on the user's plan.
    const requiredFeature = TOOL_REQUIRED_FEATURE[toolName];
    if (requiredFeature && !(await can(userId, requiredFeature))) {
      return JSON.stringify({
        success: false,
        notEntitled: true,
        message:
          `This action ("${toolName}") isn't included in the user's current plan. ` +
          `Let the user know this is a paid feature and offer to help them upgrade, instead of performing the action.`,
      });
    }

    switch (toolName) {

      // ── Task tools ────────────────────────────────────────────────────
      case 'create_task': {
        const result = await TasksService.create(userId, {
          petId: args.petId,
          title: args.title,
          taskType: args.taskType ?? 'OTHER',
          dueDate: args.dueDate ?? new Date().toISOString(),
          frequency: args.frequency ?? 'none',
          notes: args.notes,
        });
        return JSON.stringify({
          success: true,
          taskId: result.task?.id,
          message: `Task "${args.title}" created successfully`,
        });
      }

      case 'complete_task': {
        const result = await TasksService.update(userId, args.taskId, { isCompleted: true });
        return JSON.stringify({
          success: true,
          message: `Task "${result.task?.title}" marked as completed`,
        });
      }

      case 'get_upcoming_tasks': {
        const result = await TasksService.list(userId);
        const petTasks = (result.tasks ?? []).filter(
          (t: any) => (!args.petId || t.petId === args.petId) && !t.isCompleted,
        );
        return JSON.stringify({ success: true, tasks: petTasks.slice(0, 10) });
      }

      // ── Reminder tools ────────────────────────────────────────────────
      case 'set_reminder': {
        const result = await RemindersService.create(userId, {
          petId: args.petId,
          title: args.title,
          reminderTime: args.reminderTime,
          frequency: args.frequency ?? 'Once',
          notes: args.notes,
        });
        return JSON.stringify({
          success: true,
          reminderId: result.reminder?.id,
          message: `Reminder "${args.title}" set successfully`,
        });
      }

      case 'list_reminders': {
        const result = await RemindersService.list(userId);
        return JSON.stringify({ success: true, reminders: result.reminders?.slice(0, 10) });
      }

      // ── Pet info tools ────────────────────────────────────────────────
      case 'get_pet_info': {
        const data = await AiModel.getPetWithPreferences(args.petId);
        if (!data) return JSON.stringify({ success: false, error: 'Pet not found' });
        const prefs = data.prefs?.preferenceJson
          ? (() => { try { return JSON.parse(data.prefs.preferenceJson); } catch { return {}; } })()
          : {};
        return JSON.stringify({ success: true, pet: data.pet, preferences: prefs });
      }

      case 'get_all_pets': {
        const pets = await AiModel.getUserPets(userId);
        return JSON.stringify({ success: true, pets });
      }

      // ── Store tools ───────────────────────────────────────────────────
      case 'search_products': {
        const { products } = await WooCommerceService.listCachedProducts();
        const query = (args.query ?? '').toLowerCase();

        const filtered = (products as any[])
          .filter((p: any) => {
            const name = (p.payload?.name ?? '').toLowerCase();
            const desc = (p.payload?.description ?? '').toLowerCase();
            const cats = (p.payload?.categories ?? []).map((c: any) => c.name?.toLowerCase() ?? '');
            const catStr = cats.join(' ');
            return name.includes(query) || desc.includes(query) || catStr.includes(query);
          })
          .slice(0, 5)
          .map((p: any) => ({
            id: p.wooProductId,
            name: p.payload?.name,
            price: p.payload?.price,
            image: p.payload?.images?.[0]?.src,
            url: p.payload?.permalink,
          }));

        return JSON.stringify({ success: true, products: filtered, query: args.query });
      }

      // ── Care plan tools ───────────────────────────────────────────────
      case 'get_care_plan': {
        const plan = await AiModel.getActivePetCarePlan(args.petId);
        if (!plan) return JSON.stringify({ success: false, error: 'No care plan found' });
        const parsed = (() => { try { return JSON.parse(plan.planJson); } catch { return null; } })();
        return JSON.stringify({ success: true, carePlan: parsed, version: plan.version });
      }

      case 'regenerate_care_plan': {
        const plan = await CarePlanService.generate(userId, args.petId);
        return JSON.stringify({
          success: true,
          message: 'Care plan regenerated with latest pet data',
          healthAlerts: plan.health_alerts,
        });
      }

      // ── Notification tools ────────────────────────────────────────────
      case 'send_notification': {
        await NotificationsService.sendToUsers(
          [userId],
          { title: args.title, body: args.body, type: 'AI_ASSISTANT' },
          { targetMode: 'single' },
        );
        return JSON.stringify({ success: true, message: 'Notification sent' });
      }

      // ── Pet memory tools ──────────────────────────────────────────────
      case 'save_pet_fact': {
        const saved = await PetProfileService.addAiFact(
          userId,
          args.petId,
          args.fact,
          args.category,
        );
        return JSON.stringify({
          success: true,
          factId: saved.id,
          message: `Saved to ${args.petId}'s profile: "${saved.fact}"`,
        });
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err?.message ?? 'Tool execution failed' });
  }
}
