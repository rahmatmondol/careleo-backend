/**
 * Subscription feature & limit catalog — the single source of truth for what
 * a plan can toggle. Plans store `featureFlags` keyed by FeatureKey and
 * `limits` keyed by LimitKey; the Admin Plan Builder renders this catalog as a
 * checklist + numeric inputs, and the entitlements helper resolves access
 * against these same keys. Roadmap §3 (Feature → Tier mapping) is the source.
 *
 * Adding a capability to the platform = add a key here. Nothing else hard-codes
 * tier membership.
 */

/** Canonical boolean feature flags an admin can toggle per plan. */
export const FEATURE_KEYS = [
  'breed_detection',      // AI breed detection from photo
  'pet_profiling',        // AI doctor-style Q&A profiling
  'ai_chat',              // Smart AI chat + daily proactive check-ins
  'care_suggestions',     // Food / activity / health suggestions
  'product_recommend',    // View product & toy recommendations
  'store_access',         // Buy from the Food & Toy store
  'food_inventory',       // Food inventory tracking + low-stock alerts
  'assisted_reorder',     // Re-order with manual confirm
  'monthly_food_supply',  // Monthly food supply included
  'auto_reorder',         // Auto food re-order (no manual confirm)
  'freelancer_hiring',    // Hire walker / care freelancers
  'auto_hire',            // AI auto-hire (no manual confirm, Premium)
  'vet_booking',          // Vet appointment booking
  'vaccination_mgmt',     // Vaccination management
  'health_records',       // Health records + follow-up
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Canonical numeric limits an admin can set per plan. `null` = unlimited. */
export const LIMIT_KEYS = [
  'max_pets',                  // Max pet profiles the user may add
  'max_freelancer_hires_month',// Max freelancer hires per month
  'monthly_food_budget',       // Food budget (currency units) for supply/auto-order
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];

export type FeatureFlags = Partial<Record<FeatureKey, boolean>>;
export type PlanLimits = Partial<Record<LimitKey, number | null>>;

/** UI metadata so the Admin Plan Builder can render labels/groups without hard-coding. */
export const FEATURE_CATALOG: { key: FeatureKey; label: string; group: string }[] = [
  { key: 'breed_detection',     label: 'AI breed detection from photo', group: 'AI' },
  { key: 'pet_profiling',       label: 'AI pet profiling (Q&A)',        group: 'AI' },
  { key: 'ai_chat',             label: 'Smart AI chat + daily check-ins', group: 'AI' },
  { key: 'care_suggestions',    label: 'Food / activity / health suggestions', group: 'AI' },
  { key: 'product_recommend',   label: 'Product & toy recommendations', group: 'Store' },
  { key: 'store_access',        label: 'Food & Toy store (buy)',        group: 'Store' },
  { key: 'food_inventory',      label: 'Food inventory tracking',       group: 'Food' },
  { key: 'assisted_reorder',    label: 'Assisted re-order (manual confirm)', group: 'Food' },
  { key: 'monthly_food_supply', label: 'Monthly food supply',           group: 'Food' },
  { key: 'auto_reorder',        label: 'Auto food re-order',            group: 'Food' },
  { key: 'freelancer_hiring',   label: 'Freelancer hiring (walker/care)', group: 'Care' },
  { key: 'auto_hire',           label: 'AI auto-hire freelancer (Premium)', group: 'Care' },
  { key: 'vet_booking',         label: 'Vet appointment booking',       group: 'Health' },
  { key: 'vaccination_mgmt',    label: 'Vaccination management',        group: 'Health' },
  { key: 'health_records',      label: 'Health records + follow-up',    group: 'Health' },
];

export const LIMIT_CATALOG: { key: LimitKey; label: string; help: string }[] = [
  { key: 'max_pets',                   label: 'Max pets',                 help: 'Blank = unlimited' },
  { key: 'max_freelancer_hires_month', label: 'Max freelancer hires / month', help: 'Blank = unlimited' },
  { key: 'monthly_food_budget',        label: 'Monthly food budget',      help: 'Currency units; blank = none' },
];

/**
 * Default tier → feature/limit mapping from roadmap §3. Used to seed plans and
 * as the fallback Free entitlement when a user has no active subscription.
 * Admins can override any of this after seeding.
 */
export const DEFAULT_PLANS: {
  name: string;
  description: string;
  price: number;
  sortOrder: number;
  featureFlags: FeatureFlags;
  limits: PlanLimits;
}[] = [
  {
    name: 'Free',
    description: 'Add pets + full AI assistant (advice, profiling, daily chat).',
    price: 0,
    sortOrder: 0,
    featureFlags: {
      breed_detection: true,
      pet_profiling: true,
      ai_chat: true,
      care_suggestions: true,
      product_recommend: true,
      food_inventory: true,
    },
    limits: { max_pets: 2 },
  },
  {
    name: 'Standard',
    description: 'Everything in Free + Food & Toy store + monthly food supply.',
    price: 9.99,
    sortOrder: 1,
    featureFlags: {
      breed_detection: true,
      pet_profiling: true,
      ai_chat: true,
      care_suggestions: true,
      product_recommend: true,
      store_access: true,
      food_inventory: true,
      assisted_reorder: true,
      monthly_food_supply: true,
    },
    limits: { max_pets: 5 },
  },
  {
    name: 'Premium',
    description: 'Everything in Standard + full pet management (vet, vaccines, auto-order).',
    price: 24.99,
    sortOrder: 2,
    featureFlags: {
      breed_detection: true,
      pet_profiling: true,
      ai_chat: true,
      care_suggestions: true,
      product_recommend: true,
      store_access: true,
      food_inventory: true,
      assisted_reorder: true,
      monthly_food_supply: true,
      auto_reorder: true,
      freelancer_hiring: true,
      auto_hire: true,
      vet_booking: true,
      vaccination_mgmt: true,
      health_records: true,
    },
    limits: { max_pets: null, max_freelancer_hires_month: 8 },
  },
];

/** The entitlement used when a user has no active subscription. */
export const FREE_FALLBACK = DEFAULT_PLANS[0];