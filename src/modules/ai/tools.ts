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
import { PetProfileService } from '@/modules/pet-profile/service';
import { searchShopProducts } from '@/modules/store/shop-client';
import { FoodInventoryService } from '@/modules/food-inventory/service';
import { VetsService } from '@/modules/vets/service';
import { VetsModel } from '@/modules/vets/model';
import { VaccinationsService } from '@/modules/vaccinations/service';
import { assessSymptoms } from './symptom-assessment';
import { PetsService } from '@/modules/pets/service';
import { CURRENCY_CODE, formatMoney } from '@/shared/types/currency';
import { can, resolveEntitlement } from '@/modules/subscriptions/entitlements';
import { resolveCoverage } from '@/modules/subscriptions/coverage';
import {
  listOrders as listCustomerOrders,
  getOrderById as getCustomerOrderById,
} from '@/modules/shop/services/customer/order.service';
import type { FeatureKey } from '@/modules/subscriptions/catalog';
import { listFreelancers, sendJobLetter, autoHireFreelancer } from '@/modules/freelancer/freelancer-client';
import { getPreferenceContext } from '@/modules/notifications/preferences';
import { dayKeyInZone, minutesInZone, nextZonedSlot, parseClockTime, zonedTimeToUtc } from '@/shared/types/timezone';

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
        dueDate:   { type: 'string', description: "When the task is due, as the user's local wall-clock time: 'YYYY-MM-DDTHH:mm', or 'HH:mm' for the next time that clock reads it. Never UTC, never a trailing Z." },
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
        reminderTime: { type: 'string', description: "When to remind, as the user's local wall-clock time: 'YYYY-MM-DDTHH:mm', or 'HH:mm' for the next time that clock reads it. Never UTC, never a trailing Z." },
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
  /**
   * Order tools.
   *
   * The shop, orders and subscription coverage all had working APIs while the
   * assistant had no way to reach them — "where is my order?" was simply
   * unanswerable, which is one of the most common things a customer asks.
   */
  {
    name: 'get_my_orders',
    description:
      "List the user's recent orders with status, totals and what their subscription covered. Use for questions like 'where is my order', 'did my order ship', 'what did I buy last week'.",
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many recent orders to return (default 5, max 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_order_details',
    description: 'Get the full detail of one order: its items, delivery address, payment method and status.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'The order id, or the short reference the user quotes' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_plan_coverage',
    description:
      "Explain what the user's subscription pays for in the store and how much of this period's budget is left. Use before recommending a product so you can say whether it is covered, and when the user asks why something was or wasn't free.",
    parameters: { type: 'object', properties: {}, required: [] },
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
  {
    name: 'check_inventory',
    description: "Check a pet's food inventory and how many days of food remain. Use when the user asks about food stock or before suggesting a re-order.",
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID' },
      },
      required: ['petId'],
    },
  },
  {
    name: 'update_food_inventory',
    description: "Set or update a pet's food inventory: which product, how much is on hand, and daily consumption. Use when the user tells you what/how much their pet eats or how much food is left.",
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID' },
        inventoryId: { type: 'string', description: 'Existing inventory item id to update (omit to create new)' },
        productId: { type: 'string', description: 'Shop product id for the food (optional)' },
        productName: { type: 'string', description: 'Food product name' },
        quantityUnits: { type: 'number', description: 'Units of food currently on hand (e.g. grams)' },
        dailyConsumption: { type: 'number', description: 'Units consumed per day' },
        lowStockThresholdDays: { type: 'number', description: 'Alert when this many days of food remain (default 3)' },
      },
      required: ['petId'],
    },
  },
  {
    name: 'place_reorder',
    description: "Re-order more food for a pet's inventory item. For Standard users this creates a pending order the user confirms; for Premium (auto re-order) it is placed automatically. Always confirm with the user before calling unless they have auto re-order.",
    parameters: {
      type: 'object',
      properties: {
        inventoryId: { type: 'string', description: 'The food inventory item id to re-order' },
        quantity: { type: 'number', description: 'How many units/packs to order (default 1)' },
      },
      required: ['inventoryId'],
    },
  },
  {
    name: 'detect_symptoms',
    description: "Assess a pet's symptoms and gauge urgency (low/medium/high/emergency) and whether a vet visit is advised. Use whenever the user describes their pet feeling unwell. This is guidance, not a diagnosis.",
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID (optional but recommended for context)' },
        symptoms: { type: 'array', items: { type: 'string' }, description: 'List of symptoms described by the user' },
      },
      required: ['symptoms'],
    },
  },
  {
    name: 'find_nearby_vets',
    description: 'Find vets the user can book, optionally filtered by location or specialty. Use after detecting symptoms that warrant a vet visit, or when the user asks to see a vet.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Area/city to search near (optional)' },
        specialty: { type: 'string', description: 'Vet specialty if relevant (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'get_vet_availability',
    description:
      "Get a vet's free 30-minute booking slots on a specific date, already excluding times that are taken. Pass the date the user asked about; defaults to today.",
    parameters: {
      type: 'object',
      properties: {
        vetId: { type: 'string', description: 'The vet ID' },
        date: { type: 'string', description: 'Date to check, as YYYY-MM-DD. Defaults to today.' },
        type: { type: 'string', description: "Optional: 'video' or 'visit', to only show slots that accept it" },
      },
      required: ['vetId'],
    },
  },
  {
    name: 'book_vet_appointment',
    description: 'Book a vet appointment for a pet and set a reminder. Confirm the vet, date/time and type with the user first.',
    parameters: {
      type: 'object',
      properties: {
        vetId: { type: 'string', description: 'The vet ID' },
        petId: { type: 'string', description: 'The pet ID' },
        type: { type: 'string', description: "'video' or 'visit'" },
        appointmentAt: { type: 'string', description: "Appointment time as the user's local wall clock: 'YYYY-MM-DDTHH:mm'. Never UTC, never a trailing Z." },
        reason: { type: 'string', description: 'Reason for the visit' },
      },
      required: ['vetId', 'petId', 'appointmentAt'],
    },
  },
  {
    name: 'save_medical_record',
    description: 'Save a medical record for a pet after a vet visit (what was discussed, diagnosis, prescription, recommendations).',
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID' },
        title: { type: 'string', description: 'Short title, e.g. "Vet visit — vomiting"' },
        description: { type: 'string', description: 'Details: diagnosis, prescription, vet recommendations' },
        date: { type: 'string', description: 'Date of the visit (ISO or readable)' },
        vetName: { type: 'string', description: 'Vet name (optional)' },
      },
      required: ['petId', 'title', 'date'],
    },
  },
  {
    name: 'add_vaccination',
    description: 'Record a vaccination for a pet (given and/or due date). A due date sets a reminder.',
    parameters: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'The pet ID' },
        vaccineName: { type: 'string', description: 'Vaccine name' },
        givenAt: { type: 'string', description: 'Date administered (optional)' },
        dueAt: { type: 'string', description: 'Next due date (optional)' },
        notes: { type: 'string', description: 'Optional notes' },
      },
      required: ['petId', 'vaccineName'],
    },
  },
  {
    name: 'list_vaccinations',
    description: "List a pet's vaccination records and their status.",
    parameters: {
      type: 'object',
      properties: { petId: { type: 'string', description: 'The pet ID' } },
      required: ['petId'],
    },
  },
  // ── Freelancer hiring tools ──────────────────────────────────────────────
  {
    name: 'list_freelancers',
    description:
      'Find available freelancers for a pet care service (walking, sitting, grooming, training, etc.). ' +
      'Use when the user asks for help finding a walker, sitter, or groomer, or when a care gap is detected.',
    parameters: {
      type: 'object',
      properties: {
        serviceType: { type: 'string', description: 'One of: walking, sitting, grooming, training, poop_scooping, other' },
        location: { type: 'string', description: 'Optional area/city to filter by' },
      },
      required: ['serviceType'],
    },
  },
  {
    name: 'send_job_letter',
    description:
      'Send a job letter to a specific freelancer on behalf of the user. ' +
      'Always confirm the freelancer, service, and schedule with the user first.',
    parameters: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'The freelancer profile ID' },
        serviceId: { type: 'string', description: 'The specific service/gig ID (optional)' },
        petId: { type: 'string', description: 'The pet the service is for' },
        petName: { type: 'string', description: 'Pet name for the freelancer (optional)' },
        message: { type: 'string', description: 'Message to the freelancer' },
        proposedSchedule: { type: 'string', description: 'Proposed schedule description (optional)' },
      },
      required: ['profileId', 'petId'],
    },
  },
  {
    name: 'auto_hire_freelancer',
    description:
      'Automatically hire the best available freelancer for a service type (Premium only). ' +
      'The system picks the highest-rated verified freelancer and creates + accepts the booking instantly. ' +
      'Only use when the user explicitly enables auto-hire or their plan allows it.',
    parameters: {
      type: 'object',
      properties: {
        serviceType: { type: 'string', description: 'Service needed: walking, sitting, grooming, training, etc.' },
        petId: { type: 'string', description: 'The pet ID' },
        petName: { type: 'string', description: 'Pet name (optional)' },
      },
      required: ['serviceType', 'petId'],
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
  check_inventory: 'food_inventory',
  update_food_inventory: 'food_inventory',
  place_reorder: 'assisted_reorder',
  find_nearby_vets: 'vet_booking',
  get_vet_availability: 'vet_booking',
  book_vet_appointment: 'vet_booking',
  save_medical_record: 'health_records',
  add_vaccination: 'vaccination_mgmt',
  list_vaccinations: 'vaccination_mgmt',
  list_freelancers: 'freelancer_hiring',
  send_job_letter: 'freelancer_hiring',
  auto_hire_freelancer: 'auto_hire',
};

// ─── Time handling ─────────────────────────────────────────────────────────

/**
 * A date-time written by the model → the instant it means.
 *
 * The system prompt asks for the user's own wall-clock time (`2026-03-04T07:30`
 * or a bare `07:30`), because that is the only thing the user actually said —
 * asking a model to do UTC arithmetic just moves the mistake. So an unzoned
 * value is read on the user's clock instead of the server's, which is what
 * `new Date(...)` would have done. An explicit offset or `Z` is respected: it
 * is unambiguous, whoever produced it.
 */
const resolveWallClock = (value: unknown, timeZone: string, now: Date = new Date()): Date | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const timeOnly = parseClockTime(raw);
  if (timeOnly !== null) return nextZonedSlot(timeZone, raw, now);

  const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?(?::\d{2}(?:\.\d+)?)?$/);
  if (local) {
    const [, y, mo, d, hh, mm] = local;
    // A date with no time of day means "that morning", not midnight — a task
    // due at 00:00 reads as overdue for the whole day it belongs to.
    return zonedTimeToUtc(timeZone, Number(y), Number(mo), Number(d), hh ? Number(hh) : 9, mm ? Number(mm) : 0);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** `HH:mm` on the user's clock for an instant — the shape reminders store. */
const hhMmInZone = (timeZone: string, at: Date): string => {
  const minutes = minutesInZone(timeZone, at);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

// ─── Tool Executor ─────────────────────────────────────────────────────────
// Called with the function name + args from Gemini's response.

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  authToken?: string,
): Promise<string> {
  try {
    // Every time a tool carries is a time on the user's clock, so the zone is
    // resolved once per call (cached for 15s) rather than per date field.
    const { timezone } = await getPreferenceContext(userId);

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
          dueDate: (resolveWallClock(args.dueDate, timezone) ?? new Date()).toISOString(),
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
        // Reminders are stored as a calendar date + `HH:mm`, and the scheduler
        // silently refuses anything else — an ISO timestamp passed straight
        // through here produced a reminder row that never fired.
        const at = resolveWallClock(args.reminderTime, timezone) ?? new Date();
        const result = await RemindersService.create(userId, {
          petId: args.petId,
          title: args.title,
          reminderDate: dayKeyInZone(timezone, at),
          reminderTime: hhMmInZone(timezone, at),
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
        const products = await searchShopProducts(String(args.query ?? ''), 5);
        const mapped = products.map((p) => ({
          id: p.id,
          name: p.name,
          price_display: formatMoney(p.price),
          image: p.imageUrl ?? null,
          url: p.slug ? `/products/${p.slug}` : null,
        }));
        return JSON.stringify({
          success: true,
          currency: CURRENCY_CODE,
          products: mapped,
          query: args.query,
        });
      }

      // ── Order tools ───────────────────────────────────────────────────
      case 'get_my_orders': {
        const limit = Math.min(20, Math.max(1, Number(args.limit ?? 5)));
        const { orders } = await listCustomerOrders(userId);
        return JSON.stringify({
          success: true,
          // Stated explicitly, and repeated as formatted strings, because bare
          // numbers left the model to guess the currency — and in a
          // Bangladesh-flavoured conversation it guessed ৳ while every screen
          // showed $.
          currency: CURRENCY_CODE,
          displayNote: `Amounts are in ${CURRENCY_CODE}. Use the *_display strings verbatim; never convert or substitute a currency symbol.`,
          orders: orders.slice(0, limit).map((o: any) => ({
            // The user quotes the short reference the app shows them, not the uuid.
            reference: `#${String(o.id).slice(0, 8).toUpperCase()}`,
            id: o.id,
            status: o.status,
            placedAt: o.createdAt,
            items: o.itemCount,
            summary: o.previewNames?.[0] ?? null,
            // `??` is wrong here: orders placed before the subtotal column
            // existed carry its default of 0.00, not null, so the fallback
            // never fired and every old order reported a total of zero.
            total: Number(o.subtotal) || Number(o.totalAmount) || 0,
            total_display: formatMoney(Number(o.subtotal) || Number(o.totalAmount)),
            coveredByPlan: Number(o.coveredAmount ?? 0),
            coveredByPlan_display: formatMoney(o.coveredAmount),
            youPaid_display: formatMoney(
              Number(o.coveredAmount) > 0 ? o.payableAmount : o.totalAmount,
            ),
            paymentMethod: o.paymentMethod,
            paymentStatus: o.paymentStatus,
          })),
        });
      }

      case 'get_order_details': {
        const raw = String(args.orderId ?? '').replace(/^#/, '').trim();
        const { orders } = await listCustomerOrders(userId);
        // Accept either a full id or the short reference the app displays.
        const match = orders.find(
          (o: any) => o.id === raw || String(o.id).slice(0, 8).toLowerCase() === raw.toLowerCase(),
        );
        if (!match) return JSON.stringify({ success: false, message: 'No such order for this user.' });

        const detail: any = await getCustomerOrderById(userId, match.id);
        if (detail?.error) return JSON.stringify({ success: false, message: detail.error });

        return JSON.stringify({
          success: true,
          currency: CURRENCY_CODE,
          displayNote: `Amounts are in ${CURRENCY_CODE}. Use the *_display strings verbatim; never convert or substitute a currency symbol.`,
          order: {
            reference: `#${String(match.id).slice(0, 8).toUpperCase()}`,
            status: detail.order.status,
            placedAt: detail.order.createdAt,
            deliverTo: detail.order.shippingAddress,
            paymentMethod: detail.order.paymentMethod,
            paymentStatus: detail.order.paymentStatus,
            // Same pre-coverage fallback as the list above.
            total_display: formatMoney(Number(detail.order.subtotal) || Number(detail.order.totalAmount)),
            coveredByPlan_display: formatMoney(detail.order.coveredAmount),
            youPaid_display: formatMoney(
              Number(detail.order.coveredAmount) > 0
                ? detail.order.payableAmount
                : detail.order.totalAmount,
            ),
            items: detail.items.map((i: any) => ({
              name: i.productName,
              quantity: i.quantity,
              unitPrice_display: formatMoney(i.price),
              coveredQuantity: Number(i.coveredQuantity ?? 0),
            })),
          },
        });
      }

      case 'get_plan_coverage': {
        const entitlement = await resolveEntitlement(userId);
        const budget = Number(entitlement.limits.monthly_food_budget ?? 0);
        const supply = entitlement.featureFlags.monthly_food_supply === true;

        if (!supply || budget <= 0) {
          return JSON.stringify({
            success: true,
            currency: CURRENCY_CODE,
            plan: entitlement.planName,
            coversStorePurchases: false,
            message:
              'This plan does not include a store benefit, so every product is paid for normally. A plan with monthly food supply would cover eligible items.',
          });
        }

        // An empty cart still reports the benefit, which is what the AI needs
        // to answer "what does my plan cover?" before anything is added.
        const coverage = await resolveCoverage(userId, []);
        return JSON.stringify({
          success: true,
          currency: CURRENCY_CODE,
          plan: entitlement.planName,
          coversStorePurchases: true,
          monthlyBudget_display: formatMoney(budget),
          remainingThisPeriod_display: formatMoney(coverage.benefit?.remaining ?? budget),
          periodEnds: coverage.benefit?.periodEnd ?? null,
          note: 'Only products marked as included in subscription plans, and covered by this plan, are deducted. Anything else is paid normally.',
        });
      }

      // ── Care plan tools ───────────────────────────────────────────────
      case 'get_care_plan': {
        const plan = await AiModel.getActivePetCarePlan(args.petId);
        if (!plan) return JSON.stringify({ success: false, error: 'No care plan found' });
        const parsed = (() => { try { return JSON.parse(plan.planJson); } catch { return null; } })();
        return JSON.stringify({ success: true, carePlan: parsed, version: plan.version });
      }

      case 'regenerate_care_plan': {
        // Asked for in conversation, so it applies straight away — unlike the
        // app's onboarding flow, which previews the plan for review first.
        const plan = await CarePlanService.generate(userId, args.petId, { apply: true });
        return JSON.stringify({
          success: true,
          message: 'Care plan regenerated with latest pet data, and its tasks were scheduled',
          scheduleItems: (plan.daily_schedule ?? []).length,
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

      // ── Food inventory + re-order tools ───────────────────────────────
      case 'check_inventory': {
        const items = await FoodInventoryService.getInventory(userId, args.petId);
        return JSON.stringify({
          success: true,
          inventory: items.map((it) => ({
            inventoryId: it.id,
            product: it.productName,
            quantityUnits: it.quantityUnits,
            dailyConsumption: it.dailyConsumption,
            daysRemaining: it.daysRemaining === Infinity ? null : Math.round(it.daysRemaining * 10) / 10,
          })),
        });
      }

      case 'update_food_inventory': {
        const updated = await FoodInventoryService.updateInventory(userId, args.petId, {
          inventoryId: args.inventoryId,
          productId: args.productId,
          productName: args.productName,
          quantityUnits: args.quantityUnits,
          dailyConsumption: args.dailyConsumption,
          lowStockThresholdDays: args.lowStockThresholdDays,
        });
        return JSON.stringify({ success: true, inventoryId: updated?.id, message: 'Inventory updated' });
      }

      case 'place_reorder': {
        const reorder = await FoodInventoryService.requestReorder(userId, args.inventoryId, args.quantity ?? 1);
        if (reorder.status === 'pending_confirm' && authToken) {
          const placed = await FoodInventoryService.confirmReorder(userId, reorder.id, authToken);
          return JSON.stringify({
            success: placed.status === 'placed',
            reorderId: placed.id,
            status: placed.status,
            shopOrderId: placed.shopOrderId,
            message: placed.status === 'placed' ? 'Re-order placed' : 'Re-order could not be completed',
          });
        }
        return JSON.stringify({
          success: reorder.status === 'auto_placed' || reorder.status === 'pending_confirm',
          reorderId: reorder.id,
          status: reorder.status,
          shopOrderId: reorder.shopOrderId,
          message:
            reorder.status === 'auto_placed' ? 'Auto re-order placed' : 'Re-order created; confirm to place it',
        });
      }

      // ── Vet & health tools ────────────────────────────────────────────
      case 'detect_symptoms': {
        const assessment = await assessSymptoms(userId, args.petId, args.symptoms ?? []);
        return JSON.stringify({ success: true, ...assessment });
      }

      case 'find_nearby_vets': {
        // `status: 'active'` matches what the app's directory shows — the AI
        // should not offer to book a vet the admin has taken off the roster.
        const vets = await VetsModel.listVets({
          location: args.location,
          specialty: args.specialty,
          status: 'active',
        });
        return JSON.stringify({
          success: true,
          vets: (vets as any[]).slice(0, 5).map((v) => ({
            id: v.id, name: v.fullName, specialty: v.specialty,
            location: v.location, fee: v.consultationFee, rating: v.rating,
          })),
        });
      }

      case 'get_vet_availability': {
        // Was `listVetAvailability`, which returns the vet's recurring weekly
        // windows ("Mondays 10:00–17:00"). The model read those as bookable
        // times and offered them to users, including hours already taken and
        // days that had passed. `getVetSlots` is the real answer.
        const mode = args.type === 'video' || args.type === 'visit' ? args.type : undefined;
        const slots = await VetsService.getVetSlots(args.vetId, args.date, mode);
        return JSON.stringify({ success: true, ...slots });
      }

      case 'book_vet_appointment': {
        const type = args.type === 'video' ? 'video' : 'visit';
        const appointmentAt = resolveWallClock(args.appointmentAt, timezone);
        const { appointment } = await VetsService.bookAppointment(userId, args.vetId, type, {
          appointmentAt: appointmentAt ? appointmentAt.toISOString() : args.appointmentAt,
          petId: args.petId,
          reason: args.reason,
        });
        if (args.petId) {
          try {
            await RemindersService.create(userId, {
              petId: args.petId,
              title: `Vet appointment${args.reason ? ` — ${args.reason}` : ''}`,
              reminderType: 'vet_appointment',
              frequency: 'Once',
              // Date *and* time: a date alone leaves the scheduler with no
              // `HH:mm`, and it drops the reminder rather than guessing.
              reminderDate: dayKeyInZone(timezone, appointmentAt ?? new Date()),
              reminderTime: hhMmInZone(timezone, appointmentAt ?? new Date()),
              notes: 'Upcoming vet appointment.',
            });
          } catch { /* reminder is convenience */ }
        }
        return JSON.stringify({
          success: true,
          appointmentId: appointment?.id,
          message: 'Vet appointment booked and reminder set',
        });
      }

      case 'save_medical_record': {
        const record: any = await PetsService.addMedicalRecord(userId, args.petId, {
          title: args.title,
          description: args.description,
          date: args.date,
          vetName: args.vetName,
        });
        return JSON.stringify({ success: true, recordId: record?.id ?? record?.record?.id, message: 'Medical record saved' });
      }

      case 'add_vaccination': {
        const v = await VaccinationsService.add(userId, args.petId, {
          vaccineName: args.vaccineName,
          givenAt: args.givenAt,
          dueAt: args.dueAt,
          notes: args.notes,
        });
        return JSON.stringify({ success: true, vaccinationId: v.id, message: `Recorded ${v.vaccineName}` });
      }

      case 'list_vaccinations': {
        const list = await VaccinationsService.list(userId, args.petId);
        return JSON.stringify({
          success: true,
          vaccinations: list.map((v) => ({ id: v.id, name: v.vaccineName, status: v.status, dueAt: v.dueAt, givenAt: v.givenAt })),
        });
      }

      // ── Freelancer hiring tools ────────────────────────────────────────
      case 'list_freelancers': {
        const results = await listFreelancers(String(args.serviceType ?? ''), args.location);
        return JSON.stringify({
          success: true,
          currency: CURRENCY_CODE,
          freelancers: results.map((f) => ({
            profileId: f.profileId,
            serviceId: f.serviceId,
            name: f.displayName,
            serviceType: f.serviceType,
            title: f.title,
            // Formatted for the same reason as order totals: a bare number
            // leaves the model to pick a currency symbol.
            price_display: formatMoney(f.price),
            billingPeriod: f.billingPeriod,
            location: f.location,
            rating: f.rating,
            isVerified: f.isVerified,
          })),
          message: results.length ? `Found ${results.length} available freelancer(s)` : 'No freelancers found for that service type',
        });
      }

      case 'send_job_letter': {
        if (!args.profileId || !args.petId) {
          return JSON.stringify({ success: false, error: 'profileId and petId are required' });
        }
        const userRow = await AiModel.getUserPets(userId);
        const pet = (userRow as any[]).find((p: any) => p.id === args.petId);
        const job = await sendJobLetter({
          customerId: userId,
          customerEmail: '',
          petId: args.petId,
          petName: args.petName ?? pet?.name,
          profileId: args.profileId,
          serviceId: args.serviceId,
          message: args.message,
          proposedSchedule: args.proposedSchedule,
        });
        if (!job) return JSON.stringify({ success: false, error: 'Failed to send job letter — the freelancer marketplace rejected it' });
        return JSON.stringify({ success: true, jobId: job.id, message: 'Job letter sent! The freelancer will be notified.' });
      }

      case 'auto_hire_freelancer': {
        if (!args.serviceType || !args.petId) {
          return JSON.stringify({ success: false, error: 'serviceType and petId are required' });
        }
        const userRow2 = await AiModel.getUserPets(userId);
        const pet2 = (userRow2 as any[]).find((p: any) => p.id === args.petId);
        const result = await autoHireFreelancer({
          customerId: userId,
          customerEmail: '',
          petId: args.petId,
          petName: args.petName ?? pet2?.name,
          serviceType: args.serviceType,
        });
        if (!result) return JSON.stringify({ success: false, error: 'Auto-hire failed — no suitable freelancer found or service unavailable' });
        return JSON.stringify({
          success: true,
          jobId: (result.job as any)?.id,
          freelancer: result.freelancer,
          message: `Auto-hired a freelancer for ${args.serviceType}. Booking confirmed!`,
        });
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err?.message ?? 'Tool execution failed' });
  }
}
