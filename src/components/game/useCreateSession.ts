import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authedFetch } from '../../lib/firebase';
import { track } from '../../lib/track';

/**
 * Shared logic for creating a live session and navigating to the host view.
 * Used by both CreateSessionButton (direct click) and Play (auto-resume after
 * a Google sign-in redirect, where the "host" intent must survive a full-page
 * reload).
 */
export function useCreateSession() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const createSession = useCallback(async () => {
    setCreating(true);
    setError('');
    track('host'); // "start a host session" funnel step

    try {
      const res = await authedFetch('/api/session/create');
      const data = (await res.json()) as {
        roomCode?: string;
        hostToken?: string;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error || 'Failed to create session');
        setCreating(false);
        return;
      }

      if (data.roomCode && data.hostToken) {
        // Pass the token via navigation state (not the URL) for security.
        navigate(`/host/${data.roomCode}`, {
          state: { hostToken: data.hostToken, hostName: 'Host' },
        });
      } else {
        setError('Failed to create session');
        setCreating(false);
      }
    } catch {
      setError('Network error — please try again.');
      setCreating(false);
    }
  }, [navigate]);

  return { createSession, creating, error };
}
