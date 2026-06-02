import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { cn } from '../../lib/utils';
import { useCreateSession } from './useCreateSession';

/** Key under which we remember a "host a session" intent across an auth redirect. */
export const PENDING_HOST_KEY = 'dtc:pendingHostSession';

interface CreateSessionButtonProps {
  className?: string;
  variant?: 'primary' | 'nav';
  onNeedAuth?: () => void;
  isAuthenticated: boolean;
  children?: ReactNode;
}

/**
 * Button that creates a new live session via the API and redirects to /host/:code.
 * Requires Firebase auth — if not signed in, it records the host intent (so it
 * can resume after the sign-in redirect) and calls onNeedAuth.
 */
export default function CreateSessionButton({
  className,
  variant = 'primary',
  onNeedAuth,
  isAuthenticated,
  children,
}: CreateSessionButtonProps) {
  const { createSession, creating, error } = useCreateSession();

  const handleCreate = useCallback(() => {
    if (!isAuthenticated) {
      // signInWithGoogle triggers a full-page redirect, so remember that the
      // user wanted to host. Play.tsx resumes session creation on return.
      try {
        sessionStorage.setItem(PENDING_HOST_KEY, '1');
      } catch {
        /* sessionStorage may be unavailable (private mode) — non-fatal */
      }
      onNeedAuth?.();
      return;
    }

    void createSession();
  }, [isAuthenticated, onNeedAuth, createSession]);

  return (
    <div className="inline-flex flex-col items-center">
      <button
        onClick={handleCreate}
        disabled={creating}
        className={cn(
          'transition-all',
          variant === 'primary' && 'rounded-full bg-[#5A5A40] px-6 py-3 text-xs uppercase tracking-[0.3em] text-[#F5F2ED] shadow-md hover:bg-[#4A4A34] hover:shadow-lg active:scale-[0.98] disabled:opacity-40',
          variant === 'nav' && 'caps-tracking flex items-center gap-1.5 hover:opacity-60 disabled:opacity-30',
          className,
        )}
      >
        {creating ? 'Creating...' : (children || 'Host Live Session')}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
