import { api } from '@/lib/api';

export interface OrganizationSettings {
  id: string;
  name?: string;
  platformName: string;
  logoUrl?: string | null;
  email?: string | null;
  brandColor?: string | null;
}

export interface GlobalSettings {
  platformName: string;
  [key: string]: unknown;
}

export interface UpdateOrganizationSettingsInput {
  platformName?: string;
  email?: string;
  logoUrl?: string;
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const res = await api.get('/admin/settings');
  return res.data.data;
}

export async function updateGlobalSettings(input: { platformName: string }): Promise<void> {
  await api.put('/super-admin/settings', input);
}

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  const res = await api.get('/admin/organization/settings');
  return res.data.data;
}

export async function updateOrganizationSettings(
  input: UpdateOrganizationSettingsInput,
): Promise<OrganizationSettings> {
  const res = await api.put('/admin/organization/settings', input);
  return res.data.data;
}
