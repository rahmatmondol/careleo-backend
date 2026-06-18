/**
 * Baseline profiling questions asked for EVERY pet, regardless of species or
 * breed. These guarantee the profile always captures the essentials (diet,
 * allergies, conditions, vaccines, activity) even if the AI's breed-specific
 * generation misses one. Their `id`s map to structured pet_profiles fields via
 * FIELD_MAP / ARRAY_MAP in pet-profile/service.ts, so answers land in columns,
 * not just free-form facts.
 *
 * The AI then ADDS breed/species/age/weight-specific questions on top of these.
 */
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
};

export const CORE_PROFILING_QUESTIONS: ProfilingQuestion[] = [
  {
    id: 'diet_brand',
    title: 'Diet',
    question: 'What food brand do you currently give your pet?',
    type: 'text',
    required: true,
    core: true,
  },
  {
    id: 'daily_amount',
    title: 'Diet',
    question: 'How much food do you give per day?',
    type: 'text',
    required: false,
    core: true,
  },
  {
    id: 'allergies',
    title: 'Allergies',
    question: 'Does your pet have any known food or environmental allergies?',
    type: 'multi_select',
    options: ['None', 'Chicken', 'Beef', 'Dairy', 'Grain', 'Fish', 'Other'],
    required: true,
    core: true,
  },
  {
    id: 'health_conditions',
    title: 'Health',
    question: 'Any existing health conditions or ongoing concerns?',
    type: 'text',
    required: true,
    core: true,
  },
  {
    id: 'medications',
    title: 'Health',
    question: 'Is your pet currently on any medications?',
    type: 'text',
    required: false,
    core: true,
  },
  {
    id: 'vaccination',
    title: 'Vaccines',
    question: 'What is your pet’s vaccination status?',
    type: 'single_choice',
    options: ['Up to date', 'Partially vaccinated', 'Not vaccinated', 'Not sure'],
    required: true,
    core: true,
  },
  {
    id: 'activity_level',
    title: 'Activity',
    question: 'How active is your pet day to day?',
    type: 'single_choice',
    options: ['Very active', 'Moderately active', 'Low / mostly indoor'],
    required: true,
    core: true,
  },
  {
    id: 'additional_info',
    title: 'Anything else',
    question: 'Is there anything else you’d like to add about your pet? (habits, likes/dislikes, past issues — anything at all)',
    type: 'text',
    required: false,
    core: true,
    tip: 'The more you share, the better your AI assistant gets to know your pet.',
  },
];

/** The `id`s covered by core questions — AI is told not to duplicate these. */
export const CORE_QUESTION_IDS = CORE_PROFILING_QUESTIONS.map((q) => q.id);
