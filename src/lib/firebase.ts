import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, enableNetwork } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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

async function testConnection() {
  try {
    await enableNetwork(db);
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();
