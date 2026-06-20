import { describe, it, expect } from 'vitest';
import { QUESTION_BANK, pickQuestion, poolSize, pickTopicQuestion, topicPoolSize } from './questions';
import { TOPICS, TOPIC_BANK, TOPIC_LABELS } from './topics';
import type { Category, Difficulty } from '../types';

const categories = Object.keys(QUESTION_BANK) as Category[];
const difficulties: Difficulty[] = ['Light', 'Deep', 'Random'];
const leafIds = TOPICS.flatMap(g => g.children.map(c => c.id));

describe('QUESTION_BANK invariants', () => {
  it('every category has non-empty Light and Deep pools', () => {
    for (const cat of categories) {
      expect(QUESTION_BANK[cat].Light.length, `${cat} Light`).toBeGreaterThan(0);
      expect(QUESTION_BANK[cat].Deep.length, `${cat} Deep`).toBeGreaterThan(0);
    }
  });
});

describe('pickQuestion', () => {
  it('returns a question drawn from the requested category pool', () => {
    for (const cat of categories) {
      for (const diff of difficulties) {
        const q = pickQuestion(cat, diff);
        expect(q).toMatchObject({ category: cat });
        expect(typeof q.text).toBe('string');
        expect(q.questionId).toContain(cat);
        const pool = diff === 'Random'
          ? [...QUESTION_BANK[cat].Light, ...QUESTION_BANK[cat].Deep]
          : QUESTION_BANK[cat][diff];
        expect(pool).toContain(q.text);
      }
    }
  });
});

describe('poolSize', () => {
  it('matches the underlying array lengths', () => {
    const cat = categories[0];
    expect(poolSize(cat, 'Light')).toBe(QUESTION_BANK[cat].Light.length);
    expect(poolSize(cat, 'Deep')).toBe(QUESTION_BANK[cat].Deep.length);
    expect(poolSize(cat, 'Random')).toBe(
      QUESTION_BANK[cat].Light.length + QUESTION_BANK[cat].Deep.length,
    );
  });
});

describe('TOPIC invariants', () => {
  it('every topic leaf has a non-empty Light + Deep pool in TOPIC_BANK', () => {
    for (const id of leafIds) {
      expect(TOPIC_BANK[id], `missing bank for ${id}`).toBeDefined();
      expect(TOPIC_BANK[id].Light.length, `${id} Light`).toBeGreaterThan(0);
      expect(TOPIC_BANK[id].Deep.length, `${id} Deep`).toBeGreaterThan(0);
    }
  });

  it('TOPIC_LABELS covers every leaf', () => {
    for (const id of leafIds) {
      expect(TOPIC_LABELS[id], `missing label for ${id}`).toBeTruthy();
    }
  });
});

describe('pickTopicQuestion', () => {
  it('returns a question drawn from the requested leaf pool', () => {
    for (const id of leafIds) {
      for (const diff of difficulties) {
        const q = pickTopicQuestion(id, diff);
        const pool = [...TOPIC_BANK[id].Light, ...TOPIC_BANK[id].Deep];
        expect(pool, `${id}/${diff}`).toContain(q.text);
      }
    }
  });

  it('falls back gracefully for an unknown leaf', () => {
    const q = pickTopicQuestion('does.not.exist', 'Light');
    expect(typeof q.text).toBe('string');
    expect(q.text.length).toBeGreaterThan(0);
  });
});

describe('topicPoolSize', () => {
  it('matches the leaf array lengths and is 0 for unknown leaves', () => {
    const id = leafIds[0];
    expect(topicPoolSize(id, 'Light')).toBe(TOPIC_BANK[id].Light.length);
    expect(topicPoolSize(id, 'Random')).toBe(
      TOPIC_BANK[id].Light.length + TOPIC_BANK[id].Deep.length,
    );
    expect(topicPoolSize('nope', 'Random')).toBe(0);
  });
});
