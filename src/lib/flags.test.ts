import { describe, it, expect } from 'vitest';
import { codeToFlag, codeToName } from './flags';

describe('codeToFlag', () => {
  it('converts a 2-letter code to its flag emoji', () => {
    expect(codeToFlag('SG')).toBe('🇸🇬');
    expect(codeToFlag('IN')).toBe('🇮🇳');
    expect(codeToFlag('US')).toBe('🇺🇸');
  });

  it('is case-insensitive', () => {
    expect(codeToFlag('sg')).toBe('🇸🇬');
  });

  it('falls back to a globe for invalid input', () => {
    expect(codeToFlag('XXX')).toBe('🌍');
    expect(codeToFlag('1')).toBe('🌍');
    expect(codeToFlag('')).toBe('🌍');
  });
});

describe('codeToName', () => {
  it('returns the English country name', () => {
    expect(codeToName('SG')).toBe('Singapore');
    expect(codeToName('IN')).toBe('India');
  });

  it('always returns a usable non-empty string (never throws)', () => {
    expect(typeof codeToName('ZZ')).toBe('string');
    expect(codeToName('ZZ').length).toBeGreaterThan(0);
  });
});
