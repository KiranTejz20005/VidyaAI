import { create } from 'zustand';
import { api, refreshAccessToken, setApiToken } from '@/lib/api';
import { endImpersonation } from '@/lib/impersonation';
import { clearUserLocalData } from '@/lib/user-storage';
import { socketService } from '@/services/socket.service';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatar?: string | null;
  avatarUrl?: string | null;
  organizationId: string | null;
  activeOrganizationId?: string | null;
  organizationName: string | null;
  organizationCode?: string | null;
  departmentName: string | null;
  departmentId: string | null;
  forcePasswordReset?: boolean;
  preferences: {
    emailNotifications?: boolean;
    inAppAlerts?: boolean;
    autoSave?: boolean;
    weeklyDigest?: boolean;
    [key: string]: any;
  };
  hasCompletedOnboarding?: boolean;
}

export const hasRole = (userRole: string | undefined, requiredRoles: string[]): boolean => {
  if (!userRole) return false;
  let normalized = userRole.toUpperCase();
  if (normalized === 'ORG_ADMIN') normalized = 'ADMIN';
  if (normalized === 'FACULTY') normalized = 'TEACHER';
  
  if (normalized === 'SUPER_ADMIN') return true;
  
  const normalizedRequired = requiredRoles.map(r => {
    let n = r.toUpperCase();
    if (n === 'ORG_ADMIN') n = 'ADMIN';
    if (n === 'FACULTY') n = 'TEACHER';
    return n;
  });
  
  return normalizedRequired.includes(normalized);
};

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True while the backend requires a password change before any other API call. */
  passwordResetRequired: boolean;
  hasPermission: (roles: string[]) => boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  markPasswordResetRequired: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  initialize: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  googleLogin: (data: {
    token: string;
    role: 'STUDENT' | 'TEACHER' | 'ADMIN';
    isSignUp: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  /** Google/SSO popup completion — maps onto `/auth/google` when a token is present. */
  ssoLogin: (data: {
    email: string;
    firstName?: string;
    lastName?: string;
    provider?: string;
    token?: string;
    role?: 'STUDENT' | 'TEACHER' | 'ADMIN';
    isSignUp?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  /** Request a one-time code (backend may not expose OTP yet). */
  signInWithOtp: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (
    email: string,
    code: string,
    role?: 'STUDENT' | 'TEACHER' | 'ADMIN',
  ) => Promise<{ success: boolean; error?: string }>;
  signup: (data: {
    email: string;
    password?: string;
    firstName: string;
    lastName: string;
    role: 'STUDENT' | 'TEACHER';
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: { firstName?: string; lastName?: string; email?: string; avatar?: string }) => Promise<{ success: boolean; error?: string }>;
  updateOrganization: (data: { organizationName: string; department: string; academicYear?: string }) => Promise<{ success: boolean; error?: string }>;
  completeOnboarding: (data: {
    firstName: string;
    lastName: string;
    organizationName: string;
    department: string;
    className: string;
    subject: string;
    students: Array<{ name: string; rollNo: string; email: string }>;
  }) => Promise<{ success: boolean; error?: string }>;
}

function applySession(set: (partial: Partial<AuthStore>) => void, user: User, token: string) {
  setApiToken(token);
  set({
    user,
    accessToken: token,
    isAuthenticated: true,
    isLoading: false,
    passwordResetRequired: user.forcePasswordReset === true,
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  passwordResetRequired: false,

  hasPermission: (roles: string[]) => {
    const user = get().user;
    return hasRole(user?.role, roles);
  },

  setAuth: (user, token) => {
    applySession(set, user, token);
  },

  clearAuth: () => {
    setApiToken(null);
    socketService.disconnect();
    endImpersonation();
    clearUserLocalData();
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      passwordResetRequired: false,
    });
  },

  markPasswordResetRequired: () => {
    set({ passwordResetRequired: true });
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      const res = await api.put('/auth/me/password', { currentPassword, newPassword });
      const token: unknown = res.data?.data?.accessToken;
      if (typeof token === 'string' && token) {
        setApiToken(token);
        set({ accessToken: token });
      }
      set((state) => ({
        passwordResetRequired: false,
        user: state.user ? { ...state.user, forcePasswordReset: false } : null,
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update password.' };
    }
  },

  initialize: async () => {
    if (!get().isAuthenticated) {
      set({ isLoading: true });
    }
    try {
      const token = await refreshAccessToken();
      const meRes = await api.get('/auth/me');
      const user: User | undefined = meRes.data?.data;
      if (user) {
        applySession(set, user, getCurrentToken(token));
        return true;
      }
    } catch {
      // No valid session: fall through to the unauthenticated state.
    }
    if (get().isAuthenticated) {
      set({ isLoading: false });
    } else {
      get().clearAuth();
    }
    return false;
  },

  login: async (email, password) => {
    try {
      set({ isLoading: true });
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, user } = res.data?.data || {};
      if (accessToken && user) {
        applySession(set, user, accessToken);
        return { success: true };
      }
      set({ isLoading: false });
      return { success: false, error: 'Invalid response from auth server.' };
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, error: err.message || 'Login failed.' };
    }
  },

  googleLogin: async (data) => {
    try {
      set({ isLoading: true });
      const role = data.role === 'ADMIN' ? 'TEACHER' : data.role;
      const res = await api.post('/auth/google', { ...data, role });
      const { accessToken, user } = res.data?.data || {};
      if (accessToken && user) {
        applySession(set, user, accessToken);
        return { success: true };
      }
      set({ isLoading: false });
      return { success: false, error: 'Invalid response from auth server.' };
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, error: err.message || 'Google sign-in failed.' };
    }
  },

  ssoLogin: async (data) => {
    if (!data.token) {
      return { success: false, error: 'Missing SSO token.' };
    }
    return get().googleLogin({
      token: data.token,
      role: data.role === 'ADMIN' ? 'TEACHER' : data.role || 'TEACHER',
      isSignUp: data.isSignUp === true,
    });
  },

  signInWithOtp: async (email) => {
    try {
      set({ isLoading: true });
      await api.post('/auth/otp/request', { email });
      set({ isLoading: false });
      return { success: true };
    } catch (err: any) {
      set({ isLoading: false });
      const status = err?.response?.status;
      if (status === 404) {
        return {
          success: false,
          error: 'Email code login is not available. Sign in with Google instead.',
        };
      }
      return {
        success: false,
        error: err?.response?.data?.error || err.message || 'Failed to send login code.',
      };
    }
  },

  verifyOtp: async (email, code, role = 'STUDENT') => {
    try {
      set({ isLoading: true });
      const res = await api.post('/auth/otp/verify', { email, code, role });
      const { accessToken, user } = res.data?.data || {};
      if (accessToken && user) {
        applySession(set, user, accessToken);
        return { success: true };
      }
      set({ isLoading: false });
      return { success: false, error: 'Invalid response from auth server.' };
    } catch (err: any) {
      set({ isLoading: false });
      const status = err?.response?.status;
      if (status === 404) {
        return {
          success: false,
          error: 'Email code login is not available. Sign in with Google instead.',
        };
      }
      return {
        success: false,
        error: err?.response?.data?.error || err.message || 'Invalid or expired code.',
      };
    }
  },

  signup: async (data) => {
    try {
      set({ isLoading: true });
      const res = await api.post('/auth/signup', data);
      const { accessToken, user } = res.data?.data || {};
      if (accessToken && user) {
        applySession(set, user, accessToken);
        return { success: true };
      }
      set({ isLoading: false });
      return { success: false, error: 'Invalid response from auth server.' };
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, error: err.message || 'Signup failed.' };
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Logout endpoint failures must not keep the client signed in.
    } finally {
      get().clearAuth();
    }
  },

  updateProfile: async (data) => {
    try {
      const res = await api.put('/auth/me/profile', data);
      const updatedUser = res.data?.data;
      if (updatedUser) {
        set((state) => ({
          user: state.user ? { ...state.user, ...updatedUser } : null,
        }));
        return { success: true };
      }
      return { success: false, error: 'Failed to update profile.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Profile update failed.' };
    }
  },

  updateOrganization: async (data) => {
    try {
      const res = await api.put('/auth/me/organization', data);
      if (res.data?.success) {
        const meRes = await api.get('/auth/me');
        const user = meRes.data?.data;
        if (user) {
          set({ user });
        }
        return { success: true };
      }
      return { success: false, error: 'Failed to update organization settings.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Organization update failed.' };
    }
  },

  completeOnboarding: async (data) => {
    try {
      await api.put('/auth/me/profile', {
        firstName: data.firstName,
        lastName: data.lastName,
      });

      const orgRes = await api.put('/auth/me/organization', {
        organizationName: data.organizationName,
        department: data.department,
        academicYear: '2026-2027',
      });

      if (orgRes.data?.data?.accessToken) {
        setApiToken(orgRes.data.data.accessToken);
      }

      const groupRes = await api.post('/groups', {
        name: data.className,
        subject: data.subject,
      });
      const group = groupRes.data?.data;

      if (group?.id && data.students.length > 0) {
        await api.post(`/groups/${group.id}/students/bulk`, {
          students: data.students,
        });
      }

      await api.post('/auth/onboarding/complete');

      const meRes = await api.get('/auth/me');
      const user = meRes.data?.data;
      if (user) {
        set({ user });
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Onboarding failed.' };
    }
  },
}));

/** Prefer a token set during the /auth/me round-trip (e.g. a concurrent refresh) over the bootstrap one. */
function getCurrentToken(fallback: string): string {
  return useAuthStore.getState().accessToken ?? fallback;
}
