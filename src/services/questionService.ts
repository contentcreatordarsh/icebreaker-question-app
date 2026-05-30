import { Category, Difficulty, DailyQuestion } from '../types';
import { pickQuestion } from '../data/questions';
import { authedFetch } from '../lib/firebase';

/**
 * Call the Cloudflare Workers AI endpoint to generate a truly unique question.
 * Only used for the "Surprise me" feature — the static bank handles everything else.
 */
export async function generateUniqueQuestion(
  category: Category,
  difficulty: Difficulty
): Promise<Partial<DailyQuestion>> {
  const res = await authedFetch('/api/generate-question', { category, difficulty });

  // Surface rate-limit errors so the caller can show a meaningful message.
  if (res.status === 429) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? 'Daily AI limit reached. Try again tomorrow.');
  }

  if (!res.ok) {
    console.warn('Workers AI unavailable, falling back to question bank. Status:', res.status);
    return pickQuestion(category, difficulty);
  }

  const data = await res.json() as { text?: string; error?: string };
  if (data.text) {
    return {
      text: data.text,
      category,
      questionId: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
    };
  }

  // Model returned no text — fall back silently
  console.warn('Workers AI returned empty text, falling back to question bank.');
  return pickQuestion(category, difficulty);
}

/** Gradient per category — used for the share card background. */
export function getCategoryGradient(category: Category): string {
  const gradients: Record<Category, string> = {
    'Icebreaker':     'linear-gradient(135deg, #f9f5ee 0%, #ede4d0 100%)',
    'Funny':          'linear-gradient(135deg, #fef6e8 0%, #fde8c0 100%)',
    'Deep Talk':      'linear-gradient(135deg, #eeeaf6 0%, #ddd4f0 100%)',
    'Team Building':  'linear-gradient(135deg, #e8f4ee 0%, #cce8d8 100%)',
    'Date Night':     'linear-gradient(135deg, #f8eef8 0%, #ead8ea 100%)',
    'Philosophy':     'linear-gradient(135deg, #eef2f5 0%, #d8e4ec 100%)',
    'Creative Sparks':'linear-gradient(135deg, #f5f0e8 0%, #e8dfc8 100%)',
  };
  return gradients[category] ?? gradients['Icebreaker'];
}

/** Accent colour per category — used for decorative elements. */
export function getCategoryAccent(category: Category): string {
  const accents: Record<Category, string> = {
    'Icebreaker':     '#c8a96e',
    'Funny':          '#e09040',
    'Deep Talk':      '#8a6fc0',
    'Team Building':  '#4a9e78',
    'Date Night':     '#9e5a9e',
    'Philosophy':     '#4a7fa5',
    'Creative Sparks':'#a07840',
  };
  return accents[category] ?? accents['Icebreaker'];
}
