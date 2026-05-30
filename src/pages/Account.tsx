import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { auth, db, authedFetch, googleProvider, signInWithGoogle } from '../lib/firebase';
import { PLANS } from '../constants';
import { UserProfile } from '../types';

export default function Account() {
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const ADMIN_EMAILS = ['darshan.p.hegde@gmail.com'];

  useEffect(() => {
    if (loadingAuth) return;
    if (!user) {
      setLoadingProfile(false);
      return;
    }
    (async () => {
      try {
        const snap = await getDocFromServer(doc(db, 'users', user.uid));
        if (snap.exists()) setProfile(snap.data() as UserProfile);
      } catch (err) {
        console.warn('Failed to load profile:', err);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [user, loadingAuth]);

  async function handleResetUsage() {
    setError(null);
    setSuccessMsg(null);
    setResetting(true);
    try {
      const res = await authedFetch('/api/admin/reset-usage');
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        // Must use getDocFromServer — the reset is a server-side write that
        // bypasses the Firestore client cache.
        if (user) {
          const snap = await getDocFromServer(doc(db, 'users', user.uid));
          if (snap.exists()) setProfile(snap.data() as UserProfile);
        }
        setSuccessMsg('Usage counter reset to 0. You can use the app again.');
      } else {
        setError(data.error || 'Reset failed.');
      }
    } catch {
      setError('Reset failed.');
    } finally {
      setResetting(false);
    }
  }

  async function handleManageSubscription() {
    setError(null);
    setPortalLoading(true);
    try {
      const res = await authedFetch('/api/billing-portal', {
        returnUrl: window.location.origin + '/account',
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not open the billing portal.');
        setPortalLoading(false);
      }
    } catch {
      setError('Could not open the billing portal.');
      setPortalLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;
    setError(null);
    setDeleting(true);
    try {
      // 1. Delete server-side data (Firestore profile + subcollections).
      const res = await authedFetch('/api/delete-account');
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Server could not delete your data.');
      }
      // 2. Delete the Firebase Auth user, re-authenticating if required.
      try {
        await deleteUser(user);
      } catch (err) {
        if (err instanceof Error && err.message.includes('requires-recent-login')) {
          await reauthenticateWithPopup(user, googleProvider);
          await deleteUser(user);
        } else {
          throw err;
        }
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account.');
      setDeleting(false);
      setShowDelete(false);
    }
  }

  const plan = profile ? PLANS[profile.subscriptionPlan] ?? PLANS.free : PLANS.free;
  const hasSubscription =
    !!profile && (profile.subscriptionPlan === 'monthly' || profile.subscriptionPlan === 'yearly');

  return (
    <div className="min-h-screen bg-paper text-brand">
      <div className="max-w-2xl mx-auto px-6 py-12 md:py-20">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] caps-tracking opacity-50 hover:opacity-100 transition-opacity mb-10">
          <ChevronLeft size={14} /> Back to Dinner Table Cards
        </Link>

        <h1 className="font-serif text-3xl md:text-4xl italic mb-10">Account</h1>

        {loadingAuth || loadingProfile ? (
          <div className="flex items-center gap-2 text-sm opacity-50">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : !user ? (
          <div className="space-y-6">
            <p className="text-sm opacity-70">Sign in to manage your account.</p>
            <button
              onClick={() => signInWithGoogle()}
              className="text-[11px] caps-tracking border border-brand/30 rounded-full px-5 py-2.5 hover:bg-brand hover:text-paper transition-colors"
            >
              Sign in with Google
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            <section className="space-y-3">
              <div className="flex justify-between items-baseline border-b border-brand/10 pb-3">
                <span className="text-[11px] caps-tracking opacity-40">Email</span>
                <span className="text-sm">{user.email}</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-brand/10 pb-3">
                <span className="text-[11px] caps-tracking opacity-40">Plan</span>
                <span className="text-sm">
                  {plan.name}
                  {hasSubscription && profile?.subscriptionStatus === 'canceled' && (
                    <span className="opacity-50"> · canceling</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-baseline border-b border-brand/10 pb-3">
                <span className="text-[11px] caps-tracking opacity-40">Usage</span>
                <span className="text-sm">
                  {(profile?.usageCount ?? 0)} / {plan.limit + (profile?.bonusQuestions ?? 0)}
                </span>
              </div>
            </section>

            {error && <p className="text-sm text-red-700">{error}</p>}
            {successMsg && <p className="text-sm text-green-700">{successMsg}</p>}

            {/* Admin panel — only visible to admin email */}
            {ADMIN_EMAILS.includes(user.email ?? '') && (
              <section className="border border-accent/20 bg-accent/5 rounded-sm px-5 py-4 space-y-3">
                <span className="text-[10px] caps-tracking opacity-50 block">Admin tools</span>
                <button
                  onClick={handleResetUsage}
                  disabled={resetting}
                  className="inline-flex items-center gap-2 text-[11px] caps-tracking border border-brand/20 rounded-full px-5 py-2.5 hover:bg-brand hover:text-paper transition-colors disabled:opacity-50"
                >
                  {resetting && <Loader2 size={14} className="animate-spin" />}
                  Reset my usage counter → 0
                </button>
              </section>
            )}

            <section className="space-y-3">
              {hasSubscription && (
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-[11px] caps-tracking border border-brand/30 rounded-full px-5 py-2.5 hover:bg-brand hover:text-paper transition-colors disabled:opacity-50"
                >
                  {portalLoading && <Loader2 size={14} className="animate-spin" />}
                  Manage subscription
                </button>
              )}
              {!hasSubscription && (
                <Link
                  to="/"
                  className="block w-full sm:w-auto sm:inline-flex items-center justify-center text-[11px] caps-tracking border border-brand/30 rounded-full px-5 py-2.5 hover:bg-brand hover:text-paper transition-colors text-center"
                >
                  Upgrade your plan
                </Link>
              )}
            </section>

            <section className="space-y-4 pt-6 border-t border-brand/10">
              <button
                onClick={() => auth.signOut()}
                className="block text-[11px] caps-tracking opacity-60 hover:opacity-100 transition-opacity"
              >
                Sign out
              </button>
              <button
                onClick={() => setShowDelete(true)}
                className="block text-[11px] caps-tracking text-red-700/70 hover:text-red-700 transition-colors"
              >
                Delete account
              </button>
            </section>
          </div>
        )}
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 px-6">
          <div className="bg-paper border border-brand/20 rounded-2xl max-w-sm w-full p-8">
            <h2 className="font-serif text-xl italic mb-3">Delete your account?</h2>
            <p className="text-sm leading-relaxed opacity-70 mb-6">
              This permanently removes your profile, favorites, and history. Active subscriptions
              should be canceled first. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDelete(false); setError(null); }}
                disabled={deleting}
                className="text-[11px] caps-tracking opacity-60 hover:opacity-100 transition-opacity px-4 py-2 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="inline-flex items-center gap-2 text-[11px] caps-tracking bg-red-700 text-paper rounded-full px-5 py-2.5 hover:bg-red-800 transition-colors disabled:opacity-50"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
