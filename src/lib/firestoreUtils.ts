import { auth, db } from './firebase';
import { OperationType, FirestoreErrorInfo } from '../types';
import { doc, updateDoc, increment } from 'firebase/firestore';

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function incrementUsage(userId: string) {
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, {
      usageCount: increment(1)
    });
  } catch (error) {
    console.warn("Could not increment usage:", error);
  }
}
