/**
 * Baseline profiling questions asked for every pet.
 *
 * Two things matter here:
 *
 * 1. **Stage.** Onboarding only asks the `essential` set (4 questions) — right
 *    after the add-pet form, anything longer bleeds users. Everything else is
 *    `deferred`: the app asks it later from the profile screen, or the AI picks
 *    it up from chat. The AI's breed-specific extras are added on top, and only
 *    the single most useful one is promoted into onboarding.
 *
 * 2. **Species.** A fish has no activity level and a bird has no vaccination
 *    schedule worth asking about. `getCoreQuestions(petType)` returns a set that
 *    makes sense for the species instead of a dog-shaped set for everyone.
 *
 * Question `id`s map to structured pet_profiles fields via FIELD_MAP /
 * ARRAY_MAP in pet-profile/service.ts, so answers land in columns, not just
 * free-form facts. Keep ids in sync with those maps when adding questions.
 */
export type ProfilingStage = 'essential' | 'deferred';

export type FactCategory = 'diet' | 'health' | 'activity' | 'behavior' | 'preference' | 'other';

export type ProfilingQuestion = {
  id: string;
  title: string;
  question: string;
  type: 'single_choice' | 'multi_select' | 'numeric' | 'text';
  unit?: string;
  options?: string[];
  required: boolean;
  tip?: string;
  core?: boolean;
  /** `essential` is asked during onboarding; `deferred` is asked later. */
  stage: ProfilingStage;
  /** Fact category the answer is filed under. */
  category: FactCategory;
};

/** Species buckets that share a question set. */
type SpeciesGroup = 'mammal' | 'bird' | 'fish' | 'reptile';

function speciesGroup(petType?: string): SpeciesGroup {
  const t = (petType ?? '').toLowerCase();
  if (t.includes('fish')) return 'fish';
  if (t.includes('bird') || t.includes('parrot') || t.includes('budgie')) return 'bird';
  if (t.includes('reptile') || t.includes('snake') || t.includes('lizard') || t.includes('turtle') || t.includes('tortoise')) {
    return 'reptile';
  }
  return 'mammal';
}

// ─── Essential sets (asked during onboarding — keep at 4) ────────────────────

const MAMMAL_ESSENTIAL: ProfilingQuestion[] = [
  {
    id: 'diet_type',
    title: 'Diet',
    question: 'What kind of food does your pet mainly eat?',
    type: 'single_choice',
    options: ['Dry kibble', 'Wet / canned', 'Raw diet', 'Home-cooked', 'Mixed'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'diet',
  },
  {
    id: 'activity_level',
    title: 'Activity',
    question: 'How active is your pet on a typical day?',
    type: 'single_choice',
    options: ['Very active (2+ hrs)', 'Moderate (1–2 hrs)', 'Low (under 1 hr)', 'Mostly resting'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'activity',
  },
  {
    id: 'allergies',
    title: 'Allergies',
    question: 'Any known food or environmental allergies?',
    type: 'multi_select',
    options: ['None', 'Chicken', 'Beef', 'Dairy', 'Grain', 'Fish', 'Pollen / dust', 'Not sure'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'health',
  },
  {
    id: 'vaccination',
    title: 'Vaccines',
    question: 'What is your pet’s vaccination status?',
    type: 'single_choice',
    options: ['Up to date', 'Partially vaccinated', 'Not vaccinated', 'Not sure'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'health',
    tip: 'We’ll remind you before the next one is due.',
  },
];

const BIRD_ESSENTIAL: ProfilingQuestion[] = [
  {
    id: 'diet_type',
    title: 'Diet',
    question: 'What does your bird mainly eat?',
    type: 'single_choice',
    options: ['Seed mix', 'Pellets', 'Fruits & vegetables', 'Mixed'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'diet',
  },
  {
    id: 'activity_level',
    title: 'Out of cage',
    question: 'How much time does your bird spend outside the cage?',
    type: 'single_choice',
    options: ['Free-roam most of the day', 'A few hours daily', 'Under an hour', 'Mostly in cage'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'activity',
  },
  {
    id: 'health_conditions',
    title: 'Health',
    question: 'Any health issues you have noticed?',
    type: 'multi_select',
    options: ['None', 'Feather plucking', 'Breathing / wheezing', 'Appetite loss', 'Not sure'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'health',
  },
  {
    id: 'housing',
    title: 'Setup',
    question: 'How is your bird housed?',
    type: 'single_choice',
    options: ['Alone in a cage', 'Paired in a cage', 'Aviary / large enclosure', 'Free-roam room'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'behavior',
  },
];

const FISH_ESSENTIAL: ProfilingQuestion[] = [
  {
    id: 'diet_type',
    title: 'Diet',
    question: 'What do you feed your fish?',
    type: 'single_choice',
    options: ['Flakes', 'Pellets', 'Frozen food', 'Live food', 'Mixed'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'diet',
  },
  {
    id: 'tank_size',
    title: 'Tank',
    question: 'How big is the tank?',
    type: 'single_choice',
    options: ['Under 20 L', '20–60 L', '60–150 L', 'Over 150 L', 'Not sure'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'other',
  },
  {
    id: 'water_change',
    title: 'Maintenance',
    question: 'How often do you change the water?',
    type: 'single_choice',
    options: ['Weekly', 'Every 2 weeks', 'Monthly', 'Rarely'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'other',
    tip: 'We’ll set a reminder so it never slips.',
  },
  {
    id: 'housing',
    title: 'Tank mates',
    question: 'Who shares the tank?',
    type: 'single_choice',
    options: ['Kept alone', 'A few tank mates', 'Community tank', 'Not sure'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'behavior',
  },
];

const REPTILE_ESSENTIAL: ProfilingQuestion[] = [
  {
    id: 'diet_type',
    title: 'Diet',
    question: 'What does your reptile eat?',
    type: 'single_choice',
    options: ['Insects', 'Vegetables / greens', 'Rodents', 'Commercial diet', 'Mixed'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'diet',
  },
  {
    id: 'housing',
    title: 'Habitat',
    question: 'How is the enclosure heated?',
    type: 'single_choice',
    options: ['Heat lamp + thermostat', 'Heat lamp only', 'Heat mat', 'No heating', 'Not sure'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'other',
    tip: 'Temperature control is the most common reptile health issue.',
  },
  {
    id: 'health_conditions',
    title: 'Health',
    question: 'Any health issues you have noticed?',
    type: 'multi_select',
    options: ['None', 'Shedding problems', 'Appetite loss', 'Mouth / skin infection', 'Not sure'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'health',
  },
  {
    id: 'activity_level',
    title: 'Handling',
    question: 'How often do you handle your reptile?',
    type: 'single_choice',
    options: ['Daily', 'A few times a week', 'Rarely', 'Never'],
    required: true,
    core: true,
    stage: 'essential',
    category: 'activity',
  },
];

// ─── Deferred set (asked later, not during onboarding) ───────────────────────

const COMMON_DEFERRED: ProfilingQuestion[] = [
  {
    id: 'diet_brand',
    title: 'Diet',
    question: 'Which food brand do you usually buy?',
    type: 'text',
    required: false,
    core: true,
    stage: 'deferred',
    category: 'diet',
    tip: 'We use this to suggest re-orders before you run out.',
  },
  {
    id: 'daily_amount',
    title: 'Diet',
    question: 'How much food per day?',
    type: 'text',
    required: false,
    core: true,
    stage: 'deferred',
    category: 'diet',
  },
  {
    id: 'health_conditions',
    title: 'Health',
    question: 'Any existing health conditions or ongoing concerns?',
    type: 'multi_select',
    options: ['None', 'Skin issues', 'Digestive issues', 'Joint / mobility', 'Dental', 'Other'],
    required: false,
    core: true,
    stage: 'deferred',
    category: 'health',
  },
  {
    id: 'medications',
    title: 'Health',
    question: 'Is your pet on any medication right now?',
    type: 'text',
    required: false,
    core: true,
    stage: 'deferred',
    category: 'health',
  },
  {
    id: 'grooming',
    title: 'Grooming',
    question: 'How often is your pet groomed or bathed?',
    type: 'single_choice',
    options: ['Weekly', 'Monthly', 'Every few months', 'Rarely', 'Professional groomer'],
    required: false,
    core: true,
    stage: 'deferred',
    category: 'other',
  },
  {
    id: 'behavior',
    title: 'Behaviour',
    question: 'Anything about their temperament we should know?',
    type: 'multi_select',
    options: ['Friendly with strangers', 'Shy / anxious', 'Reactive to other pets', 'Separation anxiety', 'Very vocal', 'Nothing unusual'],
    required: false,
    core: true,
    stage: 'deferred',
    category: 'behavior',
  },
  {
    id: 'additional_info',
    title: 'Anything else',
    question: 'Anything else you’d like to add? (habits, likes/dislikes, past issues)',
    type: 'text',
    required: false,
    core: true,
    stage: 'deferred',
    category: 'other',
    tip: 'The more you share, the better your AI assistant gets to know your pet.',
  },
];

/** Deferred questions that make no sense for a species. */
const DEFERRED_EXCLUDE: Record<SpeciesGroup, string[]> = {
  mammal: [],
  bird: ['grooming', 'health_conditions'],
  fish: ['grooming', 'behavior', 'daily_amount'],
  reptile: ['grooming', 'health_conditions'],
};

const ESSENTIAL_BY_GROUP: Record<SpeciesGroup, ProfilingQuestion[]> = {
  mammal: MAMMAL_ESSENTIAL,
  bird: BIRD_ESSENTIAL,
  fish: FISH_ESSENTIAL,
  reptile: REPTILE_ESSENTIAL,
};

/** Questions asked during onboarding for this species. */
export function getEssentialQuestions(petType?: string): ProfilingQuestion[] {
  return ESSENTIAL_BY_GROUP[speciesGroup(petType)];
}

/** Questions kept for later (profile screen / chat), minus species-irrelevant ones. */
export function getDeferredQuestions(petType?: string): ProfilingQuestion[] {
  const group = speciesGroup(petType);
  const essentialIds = new Set(ESSENTIAL_BY_GROUP[group].map((q) => q.id));
  const excluded = new Set(DEFERRED_EXCLUDE[group]);
  return COMMON_DEFERRED.filter((q) => !essentialIds.has(q.id) && !excluded.has(q.id));
}

/** Every core question for a species — used to tell the AI what not to repeat. */
export function getCoreQuestions(petType?: string): ProfilingQuestion[] {
  return [...getEssentialQuestions(petType), ...getDeferredQuestions(petType)];
}

/** The `id`s covered by core questions — AI is told not to duplicate these. */
export function getCoreQuestionIds(petType?: string): string[] {
  return getCoreQuestions(petType).map((q) => q.id);
}

/** Every id used by any species' core set (superset, for validation). */
export const ALL_CORE_QUESTION_IDS = Array.from(
  new Set([
    ...MAMMAL_ESSENTIAL,
    ...BIRD_ESSENTIAL,
    ...FISH_ESSENTIAL,
    ...REPTILE_ESSENTIAL,
    ...COMMON_DEFERRED,
  ].map((q) => q.id)),
);
