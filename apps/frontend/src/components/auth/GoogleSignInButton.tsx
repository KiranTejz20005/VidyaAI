'use client';

import type { ReactNode } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? '';

/** Google sign-in is only offered when a real OAuth client id is configured. */
export const isGoogleSignInEnabled = GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');

interface GoogleSignInButtonProps {
  label: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Receives a Google OAuth access token issued to NEXT_PUBLIC_GOOGLE_CLIENT_ID. */
  onToken: (accessToken: string) => void | Promise<void>;
  onError: (message: string) => void;
}

function GoogleTokenButton({ label, icon, className, disabled, onToken, onError }: GoogleSignInButtonProps) {
  const startGoogleLogin = useGoogleLogin({
    flow: 'implicit',
    scope: 'openid email profile',
    onSuccess: (tokenResponse) => {
      if (!tokenResponse.access_token) {
        onError('Google did not return a sign-in token. Please try again.');
        return;
      }
      void onToken(tokenResponse.access_token);
    },
    onError: () => onError('Google sign-in failed. Please try again.'),
    onNonOAuthError: (err) => {
      if (err.type === 'popup_closed') return;
      onError(
        err.type === 'popup_failed_to_open'
          ? 'Google sign-in popup was blocked. Please allow popups for this site.'
          : 'Google sign-in failed. Please try again.',
      );
    },
  });

  return (
    <button type="button" onClick={() => startGoogleLogin()} disabled={disabled} className={className}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/**
 * Renders a Google sign-in button backed by Google Identity Services. The GSI
 * script is loaded only on pages that render this component, and nothing is
 * rendered when no client id is configured.
 */
export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  if (!isGoogleSignInEnabled) return null;
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <GoogleTokenButton {...props} />
    </GoogleOAuthProvider>
  );
}
