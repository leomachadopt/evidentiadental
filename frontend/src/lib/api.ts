import { upload } from '@vercel/blob/client';

// In production the backend is served under the Vercel service prefix
// (see vercel.json -> experimentalServices.backend.routePrefix). Locally it
// runs standalone on :3001. Override anytime with VITE_API_URL.
const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/_/backend' : 'http://localhost:3001');

function getToken(): string | null {
  return localStorage.getItem('evidentia_token');
}

export function setToken(token: string) {
  localStorage.setItem('evidentia_token', token);
}

export function clearToken() {
  localStorage.removeItem('evidentia_token');
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: authHeaders(init.headers as Record<string, string> | undefined),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

/** Fetch a file with auth and trigger a download (used for authenticated exports). */
async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Fetch print-ready HTML with auth and open it in a new tab (Print → Save as PDF). */
async function openInNewTab(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

export interface Settings {
  libkeyLibraryId: string | null;
  ezproxyPrefix: string | null;
  name: string | null;
  speciality: string | null;
  country: string | null;
  city: string | null;
  avatarUrl: string | null;
  shareLibraryActivity: boolean;
  acceptPdfRequests: boolean;
  whatsappNumber: string | null;
  discoverable: boolean;
}

export interface UserSearchResult {
  id: string;
  name: string | null;
  speciality: string | null;
  city: string | null;
  avatar_url: string | null;
  relationship: 'none' | 'pending_out' | 'pending_in' | 'friends';
}

export interface Friend {
  friendship_id: string;
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  since: string;
}

export interface PendingFriendRequest {
  friendship_id: string;
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export interface FriendActivityItem {
  added_at: string;
  paper_id: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  authors: any;
  journal: string | null;
  year: number | null;
  is_open_access: boolean;
  friend_id: string;
  friend_name: string | null;
  friend_avatar: string | null;
  friend_has_pdf: boolean;
  friend_accepts_requests: boolean;
  in_my_library: boolean;
}

export interface IncomingPdfRequest {
  id: string;
  status: string;
  channel: string;
  created_at: string;
  requester_name: string | null;
  requester_email: string;
  title: string;
  pmid: string | null;
}

export const api = {
  // Auth
  register: (body: { email: string; password: string; name?: string; speciality?: string }) =>
    request<{ token: string; user: any }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: any }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),

  // Searches
  createSearch: (question: string, yearFrom?: number) =>
    request<{ search: any; pico: any }>('/api/searches', {
      method: 'POST',
      body: JSON.stringify(yearFrom ? { question, yearFrom } : { question }),
    }),
  executeSearch: (id: string, maxResults = 30) =>
    request<{ resultsCount: number; trialsCount: number }>(`/api/searches/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ maxResults }),
    }),
  updateSearchPico: (id: string, pico: any) =>
    request<any>(`/api/searches/${id}`, { method: 'PATCH', body: JSON.stringify({ pico }) }),
  listSearches: () => request<{ searches: any[] }>('/api/searches'),
  getSearch: (id: string) => request<{ search: any; results: any[] }>(`/api/searches/${id}`),

  // Synthesis
  generateSynthesis: (searchId: string, selectedPaperIds: string[]) =>
    request<{
      synthesisId: string;
      synthesisMd: string;
      evidenceStrength: string | null;
      attempts: number;
      finalValidation: { valid: boolean; errors: string[] };
    }>(`/api/searches/${searchId}/synthesis`, { method: 'POST', body: JSON.stringify({ selectedPaperIds }) }),
  getSynthesis: (searchId: string) => request<any>(`/api/searches/${searchId}/synthesis`),

  // Exports
  exportSynthesisMarkdown: (searchId: string) =>
    downloadFile(`/api/searches/${searchId}/export/synthesis.md`, 'sintese.md'),
  exportSynthesisPdf: (searchId: string) =>
    openInNewTab(`/api/searches/${searchId}/export/synthesis.html`),

  // Library
  addToLibrary: (body: { paperId: string; collectionId?: string; tags?: string[]; note?: string }) =>
    request<{ id: string }>('/api/library', { method: 'POST', body: JSON.stringify(body) }),
  listLibrary: (params: { collectionId?: string; tag?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ items: any[] }>(`/api/library${qs ? `?${qs}` : ''}`);
  },
  updateLibraryItem: (id: string, patch: { collectionId?: string; tags?: string[]; note?: string }) =>
    request<{ ok: boolean }>(`/api/library/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  removeLibraryItem: (id: string) => request<{ ok: boolean }>(`/api/library/${id}`, { method: 'DELETE' }),

  // Collections (folders)
  listCollections: () =>
    request<{ collections: Array<{ id: string; name: string; count: number }> }>('/api/library/collections'),
  createCollection: (name: string) =>
    request<{ id: string; name: string; count: number }>('/api/library/collections', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  renameCollection: (id: string, name: string) =>
    request<{ ok: boolean }>(`/api/library/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteCollection: (id: string) =>
    request<{ ok: boolean }>(`/api/library/collections/${id}`, { method: 'DELETE' }),

  // PDF upload (browser → Vercel Blob direct, then confirm to the backend)
  uploadPdf: async (itemId: string, file: File): Promise<string> => {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `library/${itemId}/${Date.now()}-${safe}`;
    const blob = await upload(path, file, {
      access: 'public',
      contentType: 'application/pdf',
      handleUploadUrl: `${API_URL}/api/library/blob-upload`,
      clientPayload: getToken() ?? '',
    });
    await request(`/api/library/${itemId}/pdf`, {
      method: 'POST',
      body: JSON.stringify({ url: blob.url, name: file.name, size: file.size }),
    });
    return blob.url;
  },
  removePdf: (itemId: string) =>
    request<{ ok: boolean }>(`/api/library/${itemId}/pdf`, { method: 'DELETE' }),

  // Billing
  billingStatus: () =>
    request<{
      isAdmin: boolean;
      subscriptionStatus: string | null;
      isTrialing: boolean;
      currentPeriodEnd: string | null;
      hasAccess: boolean;
      searchesThisMonth: number;
      synthesesThisMonth: number;
      monthlyLimit: number | null; // Infinity (admin) serializes to null over JSON
    }>('/api/billing/status'),
  billingCheckout: (plan: 'monthly' | 'annual') =>
    request<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
  billingPortal: () => request<{ url: string }>('/api/billing/portal', { method: 'POST' }),

  // Full-text access (legal routes aggregated on demand)
  getPaperAccess: (paperId: string) =>
    request<{
      links: Array<{ label: string; url: string; kind: string; free: boolean; note?: string }>;
      isOpenAccess: boolean;
    }>(`/api/papers/${paperId}/access`),

  // Profile + institutional access + social/privacy settings
  getSettings: () => request<Settings>('/api/settings'),
  updateSettings: (body: Partial<Settings>) =>
    request<Settings>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),

  // Avatar (browser → Vercel Blob direct, then persist the URL in settings)
  uploadAvatar: async (file: File): Promise<string> => {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `avatars/${Date.now()}-${safe}`;
    const blob = await upload(path, file, {
      access: 'public',
      contentType: file.type,
      handleUploadUrl: `${API_URL}/api/library/blob-upload`,
      clientPayload: getToken() ?? '',
    });
    await request('/api/settings', { method: 'PATCH', body: JSON.stringify({ avatarUrl: blob.url }) });
    return blob.url;
  },

  // Friends (social layer)
  listFriends: () => request<{ friends: Friend[] }>('/api/friends'),
  listFriendRequests: () => request<{ requests: PendingFriendRequest[] }>('/api/friends/requests/incoming'),
  addFriend: (email: string) =>
    request<{ status: string }>('/api/friends/requests', { method: 'POST', body: JSON.stringify({ email }) }),
  addFriendById: (userId: string) =>
    request<{ status: string }>('/api/friends/requests', { method: 'POST', body: JSON.stringify({ userId }) }),
  searchUsers: (q: string) =>
    request<{ results: UserSearchResult[] }>(`/api/friends/search?q=${encodeURIComponent(q)}`),
  respondFriendRequest: (id: string, accept: boolean) =>
    request<{ ok: boolean }>(`/api/friends/requests/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    }),
  removeFriend: (friendId: string) =>
    request<{ ok: boolean }>(`/api/friends/${friendId}`, { method: 'DELETE' }),
  friendActivity: () => request<{ activity: FriendActivityItem[] }>('/api/friends/activity'),
  friendProfile: (friendId: string) =>
    request<{
      profile: { id: string; name: string | null; speciality: string | null; city: string | null; avatar_url: string | null };
      sharesActivity: boolean;
      items: FriendActivityItem[];
    }>(`/api/friends/${friendId}/profile`),
  importFromFriend: (paperId: string, collectionId?: string) =>
    request<{ id: string }>('/api/friends/import', {
      method: 'POST',
      body: JSON.stringify(collectionId ? { paperId, collectionId } : { paperId }),
    }),
  requestPdf: (paperId: string, ownerId: string) =>
    request<{ id: string; channel: 'whatsapp' | 'email'; deeplink: string; ownerName: string | null }>(
      '/api/friends/pdf-requests',
      { method: 'POST', body: JSON.stringify({ paperId, ownerId }) },
    ),
  incomingPdfRequests: () =>
    request<{ requests: IncomingPdfRequest[] }>('/api/friends/pdf-requests/incoming'),
  resolvePdfRequest: (id: string, status: 'fulfilled' | 'declined') =>
    request<{ ok: boolean }>(`/api/friends/pdf-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Current user + access state (source of truth for gating)
  me: () =>
    request<{
      id: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      isAdmin: boolean;
      subscriptionStatus: string | null;
      isTrialing: boolean;
      currentPeriodEnd: string | null;
      hasAccess: boolean;
    }>('/api/auth/me'),

  // Admin
  adminStats: () =>
    request<{
      totalUsers: number;
      admins: number;
      subscribed: number;
      byTier: Record<string, number>;
      totalSearches: number;
      totalSyntheses: number;
      tokensInput: number;
      tokensOutput: number;
      estCostUsd: number;
    }>('/api/admin/stats'),
  adminUsers: () => request<{ users: any[] }>('/api/admin/users'),
  adminUpdateUser: (
    id: string,
    patch: { access?: 'active' | 'trialing' | 'canceled' | 'none'; isAdmin?: boolean },
  ) => request<any>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  adminDeleteUser: (id: string) =>
    request<{ ok: boolean; email: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
};
