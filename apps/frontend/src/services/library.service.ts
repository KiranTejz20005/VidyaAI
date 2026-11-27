import { apiClient } from './api.client';

export interface LibraryResource {
  id: string;
  title: string;
  description?: string;
  resourceType: string;
  subject?: string;
  className?: string;
  fileUrl: string;
  fileSize?: number;
  uploadedById: string;
  uploadedBy?: { firstName: string; lastName: string };
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

const OBJECT_URL_TTL_MS = 60_000;
const INLINE_VIEWABLE_TYPES = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/i;

function isAbsoluteHttpUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

function filenameFromDisposition(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return null;
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

function fallbackFilename(resource: LibraryResource): string {
  const fromUrl = resource.fileUrl?.split(/[\\/]/).pop();
  return fromUrl || resource.title || 'resource';
}

async function fetchResourceBlob(
  resource: LibraryResource,
  mode: 'download' | 'view',
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`/library/${encodeURIComponent(resource.id)}/${mode}`, {
    responseType: 'blob',
  });
  const contentType = String(response.headers['content-type'] ?? '').split(';')[0].trim();
  const blob = contentType && response.data.type !== contentType
    ? new Blob([response.data], { type: contentType })
    : response.data;
  const filename = filenameFromDisposition(response.headers['content-disposition']) ?? fallbackFilename(resource);
  return { blob, filename };
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_TTL_MS);
}

/** Like LibraryService.getResources, but surfaces request failures so pages can render an error state. */
export async function fetchLibraryResources(params?: {
  subject?: string;
  className?: string;
  resourceType?: string;
  search?: string;
}): Promise<LibraryResource[]> {
  const response = await apiClient.get<{ success: boolean; data: LibraryResource[] }>('/library', { params });
  return Array.isArray(response.data?.data) ? response.data.data : [];
}

export const LibraryService = {
  uploadResource: async (formData: FormData): Promise<LibraryResource> => {
    // Note: apiClient uses axios, so we can post FormData directly
    // Also, normally you might have a different header for multipart/form-data
    // but axios sets it automatically when passing FormData
    const response = await apiClient.post<{ success: boolean; data: LibraryResource }>('/library', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },

  getResources: async (params?: { subject?: string; className?: string; resourceType?: string; search?: string }): Promise<LibraryResource[]> => {
    try {
      const response = await apiClient.get<{ success: boolean; data: LibraryResource[] }>('/library', { params });
      if (Array.isArray(response.data?.data)) {
        return response.data.data;
      }
      if (Array.isArray(response.data)) {
        return response.data as unknown as LibraryResource[];
      }
      return [];
    } catch (err) {
      console.warn('LibraryService.getResources warning:', err);
      return [];
    }
  },

  updateResource: async (id: string, data: Partial<LibraryResource>): Promise<LibraryResource> => {
    const response = await apiClient.put<{ success: boolean; data: LibraryResource }>(`/library/${id}`, data);
    return response.data.data;
  },

  deleteResource: async (id: string): Promise<void> => {
    await apiClient.delete(`/library/${id}`);
  },

  downloadResource: async (resource: LibraryResource) => {
    if (isAbsoluteHttpUrl(resource.fileUrl)) {
      window.open(resource.fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const { blob, filename } = await fetchResourceBlob(resource, 'download');
    saveBlob(blob, filename);
  },

  viewResource: async (resource: LibraryResource) => {
    if (isAbsoluteHttpUrl(resource.fileUrl)) {
      window.open(resource.fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const { blob, filename } = await fetchResourceBlob(resource, 'view');
    // A blob: URL inherits this app's origin, so only render types that cannot execute script.
    if (!INLINE_VIEWABLE_TYPES.test(blob.type)) {
      saveBlob(blob, filename);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_TTL_MS);
  },
};
