import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({ api: { post: vi.fn(), get: vi.fn(), defaults: { headers: { common: {} } } } }));

import { api } from '@/lib/api';
import { useAuthStore, OTP_UNAVAILABLE_MESSAGE } from './auth.store';

describe('OTP login without backend support', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signInWithOtp reports a clear message on 404', async () => {
    (api.post as any).mockRejectedValue({ response: { status: 404 } });
    const r = await useAuthStore.getState().signInWithOtp('a@b.co');
    expect(r).toEqual({ success: false, error: OTP_UNAVAILABLE_MESSAGE });
  });

  it('verifyOtp reports a clear message on 404', async () => {
    (api.post as any).mockRejectedValue({ response: { status: 404 } });
    const r = await useAuthStore.getState().verifyOtp('a@b.co', '123456');
    expect(r).toEqual({ success: false, error: OTP_UNAVAILABLE_MESSAGE });
  });
});
