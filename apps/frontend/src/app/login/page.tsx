'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useAuthStore } from '@/store/auth.store';
import { getDashboardRoute, isOnboarded } from '@/utils/navigation';
import toast from 'react-hot-toast';
import {
  Mail,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

function resolveDashboardPath(user: { role?: string; hasCompletedOnboarding?: boolean; organizationId?: string | null; departmentId?: string | null } | null) {
  if (!user) return '/login';
  return isOnboarded(user) ? getDashboardRoute(user.role || '') : '/onboarding';
}

const fieldClass =
  'auth-field w-full rounded-[14px] border border-neutral-200/90 bg-white px-3.5 py-3 text-[15px] leading-snug text-neutral-900 placeholder:text-neutral-400 transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] focus:border-neutral-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:opacity-60';

const primaryBtnClass =
  'flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3 text-[15px] font-semibold tracking-[-0.01em] text-white shadow-sm transition-[transform,background-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-800 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100';

const secondaryBtnClass =
  'flex w-full items-center justify-center gap-2.5 rounded-full border border-neutral-200 bg-white px-4 py-3 text-[15px] font-medium tracking-[-0.01em] text-neutral-800 shadow-sm transition-[transform,background-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-50 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100';

export default function LoginPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { login } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement | null>(null);

  const spring = reduceMotion
    ? { type: 'tween' as const, duration: 0.15 }
    : { type: 'spring' as const, duration: 0.35, bounce: 0 };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.05,
        delayChildren: reduceMotion ? 0 : 0.04,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: spring,
    },
  };

  const finishAuth = (successToast: string) => {
    toast.success(successToast);
    const user = useAuthStore.getState().user;
    router.replace(resolveDashboardPath(user));
  };

  const handleGoogleSuccess = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsSubmitting(true);
      const { googleLogin } = useAuthStore.getState();
      const result = await googleLogin({
        token: tokenResponse.access_token,
        isSignUp: false,
      });
      setIsSubmitting(false);

      if (result.success) {
        finishAuth('Successfully logged in with Google!');
      } else {
        toast.error(result.error || 'Google login failed.');
      }
    },
    onError: () => {
      toast.error('Google sign-in failed. Please try again or use email and password.');
    },
  });

  const handleGoogleAuth = () => {
    try {
      handleGoogleSuccess();
    } catch {
      toast.error('Google sign-in is unavailable right now. Please use email and password.');
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Enter your password.');
      passwordRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    const result = await login(trimmedEmail, password);
    setIsSubmitting(false);

    if (result.success) {
      finishAuth('Welcome back!');
    } else {
      setErrorMessage(result.error || 'Invalid email or password.');
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full overflow-x-hidden bg-white font-sans text-neutral-950 antialiased selection:bg-neutral-900 selection:text-white lg:h-dvh lg:overflow-hidden">
      <div className="flex h-full w-full flex-col justify-between overflow-y-auto p-4 sm:p-6 lg:w-1/2 lg:p-8 xl:p-10">
        <div className="flex w-full items-center">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-bold tracking-tight text-neutral-950 transition-opacity duration-150 hover:opacity-80 sm:text-lg"
          >
            <img src="/logo.png" alt="VidyaAI Logo" className="h-7 w-7 object-contain" />
            VIDYA AI
          </Link>
        </div>

        <div className="my-auto flex flex-1 items-center justify-center py-4 sm:py-6">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-[360px] sm:max-w-[390px]"
          >
            <motion.div variants={itemVariants} className="mb-5 text-center sm:mb-6">
              <h1 className="text-balance text-[28px] font-bold tracking-[-0.03em] text-neutral-900 sm:text-[32px]">
                Welcome Back
              </h1>
              <p className="mt-1.5 text-pretty text-[13px] leading-relaxed text-neutral-500">
                Sign in to access your assessment workspace
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="mb-3 sm:mb-4">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isSubmitting}
                className={secondaryBtnClass}
              >
                <GoogleIcon className="text-lg" />
                <span>Continue with Google</span>
              </button>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="relative my-3 flex items-center sm:my-4"
            >
              <div className="grow border-t border-neutral-200" />
              <span className="px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                or email
              </span>
              <div className="grow border-t border-neutral-200" />
            </motion.div>

            <AnimatePresence mode="wait" initial={false}>
              {errorMessage && (
                <motion.div
                  key={errorMessage}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="mb-3 flex items-start gap-2 rounded-[14px] border border-red-200/80 bg-red-50 px-3 py-2.5 text-[13px] text-red-700"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <span className="leading-relaxed">{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.form
              variants={itemVariants}
              onSubmit={handlePasswordLogin}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-[12px] font-semibold tracking-wide text-neutral-700">
                  Email
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="name@university.edu"
                    disabled={isSubmitting}
                    className={`${fieldClass} pl-10`}
                  />
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-[12px] font-semibold tracking-wide text-neutral-700">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-[12px] font-medium text-neutral-500 transition-colors duration-150 hover:text-neutral-900"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="Enter your password"
                    disabled={isSubmitting}
                    className={`${fieldClass} pl-10 pr-11`}
                  />
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 transition-colors duration-150 hover:text-neutral-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim() || !password}
                  className={primaryBtnClass}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.form>

            <motion.div variants={itemVariants} className="mt-6 text-center">
              <p className="text-[13px] text-neutral-500">
                Don&apos;t have an account?{' '}
                <Link
                  href="/register"
                  className="font-semibold text-neutral-900 underline decoration-neutral-300 underline-offset-2 transition-colors duration-150 hover:decoration-neutral-900"
                >
                  Create one
                </Link>
              </p>
            </motion.div>
          </motion.div>
        </div>

        <div className="flex flex-col items-center justify-between gap-2 border-t border-neutral-100 pt-3 text-[11px] text-neutral-400 sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Vidya AI. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="transition-colors duration-150 hover:text-neutral-600">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors duration-150 hover:text-neutral-600">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>

      <div className="hidden h-full p-3 sm:p-4 lg:block lg:w-1/2 lg:p-5">
        <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] bg-neutral-900 shadow-inner">
          <img
            src="https://assets.watermelon.sh/auth-7.avif"
            alt="Vidya AI Authentication"
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/75 via-black/15 to-transparent p-8 text-white xl:p-10">
            <span className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-300">
              Empowering Education
            </span>
            <h2 className="mb-2 text-balance text-2xl font-bold tracking-[-0.02em] xl:text-3xl">
              Transform Higher Education
            </h2>
            <p className="max-w-md text-pretty text-xs leading-relaxed text-neutral-200 sm:text-sm">
              Create AI-driven question papers, conduct rubric-based automated evaluations, and elevate institutional learning outcomes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
