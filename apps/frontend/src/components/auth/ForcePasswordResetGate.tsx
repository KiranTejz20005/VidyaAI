'use client';

import { useState } from 'react';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';
import { validatePasswordPolicy, PASSWORD_POLICY_HINT } from '@/lib/auth-http';

/**
 * Full-screen gate for accounts with forcePasswordReset / passwordResetRequired.
 * Blocks dashboard mounts (and their API storms) until a new password is set.
 */
export function ForcePasswordResetGate() {
  const changePassword = useAuthStore((s) => s.changePassword);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      toast.error(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await changePassword(undefined, newPassword);
      if (result.success) {
        toast.success('Password updated. Welcome back!');
      } else {
        toast.error(result.error || 'Failed to update password.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <KeyRound className="size-6" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Set a new password</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Your account requires a password change before you can continue. This is required after an
          admin invite or password reset.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{PASSWORD_POLICY_HINT}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">New password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="auth-field w-full rounded-xl border border-border bg-background px-4 py-2.5 pr-10 text-sm outline-none focus:border-emerald-500"
                placeholder="Enter new password"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="auth-field w-full rounded-xl border border-border bg-background px-4 py-2.5 pr-10 text-sm outline-none focus:border-emerald-500"
                placeholder="Confirm new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            {submitting ? 'Updating…' : 'Update password & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
