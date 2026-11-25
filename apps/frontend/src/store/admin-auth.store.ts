import { create } from 'zustand';
import { api, setApiToken } from '@/lib/api';
import {
  beginImpersonation,
  endImpersonation,
  getOriginalAdminToken,
  hasImpersonationFlag,
  purgeLegacyImpersonationToken,
} from '@/lib/impersonation';
import { socketService } from '@/services/socket.service';
import { useAuthStore } from './auth.store';

export interface AvailableOrganization {
  id: string;
  name: string;
  code: string;
  role: string;
  email?: string;
}

interface AdminAuthStore {
  isImpersonating: boolean;
  availableOrganizations: AvailableOrganization[];
  activeOrganizationId: string | null;
  /** Token captured before impersonation; mirrors `getOriginalAdminToken()`. */
  originalAdminToken: string | null;
  setOriginalAdminToken: (token: string | null) => void;
  initializeFromStorage: () => void | Promise<void>;
  exitImpersonation: () => Promise<void>;
  fetchAvailableOrganizations: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<boolean>;
  setActiveOrganization: (orgId: string | null) => void;
}

let authSubscribed = false;

export const useAdminAuthStore = create<AdminAuthStore>((set, get) => ({
  isImpersonating: false,
  availableOrganizations: [],
  activeOrganizationId: null,
  originalAdminToken: null,

  setOriginalAdminToken: (token) => {
    if (token) {
      beginImpersonation(token);
    } else {
      endImpersonation();
    }
    socketService.disconnect();
    set({ isImpersonating: !!token, originalAdminToken: token });
  },

  initializeFromStorage: async () => {
    if (typeof window === 'undefined') return;
    purgeLegacyImpersonationToken();

    if (!authSubscribed) {
      authSubscribed = true;
      // Keep activeOrganizationId in sync when the user is loaded/updated, and
      // drop impersonation state once the session is cleared.
      useAuthStore.subscribe((state) => {
        const user = state.user;
        const activeOrgId = user?.activeOrganizationId || user?.organizationId || null;
        if (useAdminAuthStore.getState().activeOrganizationId !== activeOrgId) {
          useAdminAuthStore.setState({ activeOrganizationId: activeOrgId });
        }
        if (!state.isAuthenticated && !state.isLoading && useAdminAuthStore.getState().isImpersonating) {
          useAdminAuthStore.setState({ isImpersonating: false });
        }
      });
    }

    const user = useAuthStore.getState().user;
    set({
      isImpersonating: hasImpersonationFlag(),
      originalAdminToken: getOriginalAdminToken(),
      activeOrganizationId: user?.activeOrganizationId || user?.organizationId || null,
    });
  },

  exitImpersonation: async () => {
    if (!get().isImpersonating) return;
    const originalToken = getOriginalAdminToken();
    endImpersonation();
    socketService.disconnect();
    set({ isImpersonating: false });

    if (originalToken) {
      setApiToken(originalToken);
      try {
        const meRes = await api.get('/auth/me');
        if (meRes.data?.data) {
          useAuthStore.getState().setAuth(meRes.data.data, originalToken);
          return;
        }
      } catch {
        setApiToken(null);
      }
    }
    // The in-memory token is gone (page reload) or no longer valid: recover the
    // super-admin session from the httpOnly refresh cookie.
    await useAuthStore.getState().initialize();
  },

  fetchAvailableOrganizations: async () => {
    try {
      const res = await api.get('/auth/me/organizations');
      if (res.data?.success) {
        const orgs: AvailableOrganization[] = res.data.data;
        set({ availableOrganizations: orgs });
        const stored = get().activeOrganizationId;
        if (!stored && orgs.length > 0) {
          set({ activeOrganizationId: orgs[0].id });
        }
      }
    } catch {
      // keep the previously loaded list on transient failures
    }
  },

  switchOrganization: async (orgId) => {
    try {
      const res = await api.post('/auth/me/switch-organization', { organizationId: orgId });
      if (res.data?.success) {
        set({ activeOrganizationId: orgId });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  setActiveOrganization: (orgId) => {
    set({ activeOrganizationId: orgId });
  },
}));
