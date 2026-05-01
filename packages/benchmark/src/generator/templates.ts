export interface CategoryDistribution {
  category: string;
  easy: number;
  medium: number;
  hard: number;
  adversarial: number;
}

export const CATEGORY_DISTRIBUTIONS: CategoryDistribution[] = [
  { category: 'VALUATION_REQUEST', easy: 40, medium: 30, hard: 20, adversarial: 10 },
  { category: 'LEGAL_OPINION', easy: 40, medium: 30, hard: 20, adversarial: 10 },
  { category: 'TITLE_SEARCH', easy: 35, medium: 25, hard: 20, adversarial: 10 },
  { category: 'INSURANCE_RENEWAL', easy: 35, medium: 25, hard: 20, adversarial: 10 },
  { category: 'RELEASE_OF_COLLATERAL', easy: 35, medium: 25, hard: 20, adversarial: 10 },
  { category: 'SITE_VISIT', easy: 35, medium: 25, hard: 20, adversarial: 10 },
  { category: 'DOCUMENT_COLLECTION', easy: 35, medium: 25, hard: 20, adversarial: 10 },
  { category: 'GENERAL_INQUIRY', easy: 35, medium: 25, hard: 20, adversarial: 10 },
];

export const SPECIAL_DISTRIBUTIONS = [
  { category: 'MULTI_INTENT', easy: 0, medium: 0, hard: 80, adversarial: 20 },
  { category: 'NOISE', easy: 0, medium: 0, hard: 0, adversarial: 60 },
];

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'ADVERSARIAL';

export const VARIATION_TAGS = [
  'hinglish',
  'forwarded_chain',
  'multi_intent',
  'typos',
  'informal',
  'formal_legal',
  'abbreviated',
  'thread_reply',
  'cc_heavy',
  'attachment_reference',
] as const;

export type VariationTag = (typeof VARIATION_TAGS)[number];

export const GEOGRAPHIES = [
  'Mumbai', 'Pune', 'Delhi NCR', 'Bangalore', 'Chennai',
  'Hyderabad', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow',
];

export const TONES = ['formal', 'informal', 'urgent', 'polite', 'frustrated', 'neutral'];

export const SENDER_PERSONAS = [
  'Branch Manager',
  'FPR (Field Process Representative)',
  'Vendor (Valuer)',
  'Vendor (Legal)',
  'Customer',
  'Insurance Company Rep',
  'Internal Collateral Officer',
  'External Advocate',
  'Operations Team',
  'Senior Management',
];

export const COMPLETENESS_LEVELS = ['complete', 'partial', 'minimal'];

export interface GenerationSpec {
  category: string;
  difficulty: Difficulty;
  count: number;
}

export function buildGenerationPlan(scale = 1.0): GenerationSpec[] {
  const specs: GenerationSpec[] = [];

  for (const dist of CATEGORY_DISTRIBUTIONS) {
    if (dist.easy > 0) specs.push({ category: dist.category, difficulty: 'EASY', count: Math.ceil(dist.easy * scale) });
    if (dist.medium > 0) specs.push({ category: dist.category, difficulty: 'MEDIUM', count: Math.ceil(dist.medium * scale) });
    if (dist.hard > 0) specs.push({ category: dist.category, difficulty: 'HARD', count: Math.ceil(dist.hard * scale) });
    if (dist.adversarial > 0) specs.push({ category: dist.category, difficulty: 'ADVERSARIAL', count: Math.ceil(dist.adversarial * scale) });
  }

  for (const dist of SPECIAL_DISTRIBUTIONS) {
    if (dist.hard > 0) specs.push({ category: dist.category, difficulty: 'HARD', count: Math.ceil(dist.hard * scale) });
    if (dist.adversarial > 0) specs.push({ category: dist.category, difficulty: 'ADVERSARIAL', count: Math.ceil(dist.adversarial * scale) });
  }

  return specs;
}
