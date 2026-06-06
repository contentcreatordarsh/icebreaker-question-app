import { useEffect } from 'react';

const SITE_NAME = 'Dinner Table Cards';

/**
 * Sets `document.title` to `"<title> · Dinner Table Cards"` for as long as the
 * calling component is mounted with this title. Pass `null`/`undefined` to skip
 * (leaves whatever the route-level title set). Used by the live-session pages to
 * surface the current game phase (e.g. "Question 2", "Voting") in the browser
 * tab and to screen readers — layered on top of the route-level title.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${SITE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
