'use client';

/**
 * Accept organization invitation page.
 * Linked from invite emails (email.service sendInvitationEmail → /accept-invite?token=).
 * No other accept-invite UI exists. Calls POST /auth/accept-invite.
 * User instruction: implement Phase 3 plan (accept-invite page).
 */

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api, setApiToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { getDashboardRoute } from '@/utils/navigation';
import { validatePasswordPolicy, PASSWORD_POLICY_HINT } from '@/lib/auth-http';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams]);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error('This invitation link is missing a token.');
      return;
    }
    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      toast.error(policyError);
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/auth/accept-invite', {
        token,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      const { accessToken, user } = res.data?.data || {};
      if (!accessToken || !user) {
        toast.error('Invitation could not be accepted.');
        return;
      }
      setApiToken(accessToken);
      setAuth(user, accessToken);
      toast.success('Welcome! Your account is ready.');
      router.replace(getDashboardRoute(user.role || 'STUDENT'));
    } catch (err: any) {
      toast.error(err.message || 'Invitation is invalid or expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
      <h1 className="text-2xl font-bold text-foreground">Accept invitation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create your password to join the organization. {PASSWORD_POLICY_HINT}
      </p>

      {!token ? (
        <p className="mt-6 text-sm text-red-600">
          Invalid link. Ask your admin to resend the invitation, or{' '}
          <Link href="/login" className="underline">
            sign in
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">First name</label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="auth-field w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Last name</label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="auth-field w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-field w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Confirm password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="auth-field w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {submitting ? 'Creating account…' : 'Accept & continue'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading invitation…</p>}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
