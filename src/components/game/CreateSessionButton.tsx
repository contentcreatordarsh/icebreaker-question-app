import type { ReactNode } from 'react';
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authedFetch } from '../../lib/firebase';
import { cn } from '../../lib/utils';

interface CreateSessionButtonProps {
  className?: string;
  variant?: 'primary' | 'nav';
  onNeedAuth?: () => void;
  isAuthenticated: boolean;
  children?: ReactNode;
}

/**
 * Button that creates a new live session via the API and redirects to /host/:code.
 * Requires Firebase auth — if not signed in, calls onNeedAuth.
 */
export default function CreateSessionButton({
  className,
  variant = 'primary',
  onNeedAuth,
  isAuthenticated,
  children,
}: CreateSessionButtonProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = useCallback(async () => {
    if (!isAuthenticated) {
      onNeedAuth?.();
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await authedFetch('/api/session/create');
      const data = await res.json() as { roomCode?: string; hostToken?: string; error?: string };

      if (!res.ok) {
        setError(data.error || 'Failed to create session');
        setCreating(false);
        return;
      }

      if (data.roomCode && data.hostToken) {
        // Navigate to host view with the token in state (not in URL for security)
        navigate(`/host/${data.roomCode}`, {
          state: { hostToken: data.hostToken, hostName: 'Host' },
        });
      }
    } catch {
      setError('Network error — please try again.');
      setCreating(false);
    }
  }, [isAuthenticated, onNeedAuth, navigate]);

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
