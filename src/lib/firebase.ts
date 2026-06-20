import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Lazily load + initialise Firestore. The Firestore SDK is ~60KB gzipped and is
 * only needed for favorites, history, search, and the profile fallback — none of
 * which are on the first-paint path. Dynamically importing it keeps that weight
 * out of the critical bundle (big mobile perf win). The instance is cached.
 */
let _dbPromise: Promise<Firestore> | null = null;
export function getDb(): Promise<Firestore> {
  if (!_dbPromise) {
    _dbPromise = import('firebase/firestore').then(({ getFirestore }) =>
      getFirestore(app, firebaseConfig.firestoreDatabaseId),
    );
  }
  return _dbPromise;
}

/**
 * Sign in with Google using a full-page redirect instead of a popup.
 * Popup-based sign-in is blocked by default on new domains / mobile browsers.
 * signInWithRedirect has no such restriction and works reliably everywhere.
 */
export const signInWithGoogle = () => signInWithRedirect(auth, googleProvider);

/**
 * Call once on app mount to finalise a pending Google redirect sign-in.
 * Firebase stores the result in IndexedDB; this retrieves and clears it.
 * Errors (e.g. user cancelled, account disabled) are surfaced as thrown exceptions.
 */
export { getRedirectResult };

/**
 * fetch() wrapper that attaches the current user's Firebase ID token as a
 * Bearer header. Use for all authenticated Worker API calls. Throws if the
 * user is not signed in.
 */
export async function authedFetch(path: string, body?: unknown): Promise<Response> {
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');
  const token = await current.getIdToken();
  return fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Authenticated GET request. Throws if user is not signed in. */
export async function authedGet(path: string): Promise<Response> {
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');
  const token = await current.getIdToken();
  return fetch(path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

