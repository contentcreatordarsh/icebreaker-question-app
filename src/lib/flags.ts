// Country-code helpers for the "around the world" stats display.
// Codes are ISO 3166-1 alpha-2 (e.g. "IN", "SG", "US").

/** Convert a 2-letter country code to its flag emoji (regional indicators). */
export function codeToFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '🌍';
  const cc = code.toUpperCase();
  return String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + (c.charCodeAt(0) - 65)));
}

let regionNames: Intl.DisplayNames | null = null;

/** Convert a 2-letter country code to its English name (falls back to the code). */
export function codeToName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
