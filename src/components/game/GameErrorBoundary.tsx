import React from 'react';

interface Props { children: React.ReactNode; fallbackMessage?: string }
interface State { hasError: boolean; message: string }

/**
 * Game-specific error boundary — catches crashes in game sub-components
 * (Leaderboard, AnswerCard, VotingCard, etc.) without killing the entire page.
 * Shows a friendlier recovery UI than the root ErrorBoundary.
 */
export default class GameErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[GameErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="mb-2 text-sm font-medium text-red-700">
            {this.props.fallbackMessage || 'Something went wrong displaying this section.'}
          </p>
          <p className="mb-4 text-xs text-red-500/70">{this.state.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="rounded-full bg-red-600 px-4 py-1.5 text-xs text-white transition-opacity hover:opacity-80"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
