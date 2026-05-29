import { Router } from 'express';
import { z } from 'zod';
import { del } from '@vercel/blob';
import { query } from '../db/client.js';
import { config } from '../lib/config.js';
import { authRequired } from '../middleware/auth.js';

export const settingsRouter = Router();
settingsRouter.use(authRequired);

// Kept name `InstitutionalSettings` (consumed by fulltext-service / papers route,
// which only read the institutional fields); now also carries profile + social prefs.
export interface InstitutionalSettings {
  libkeyLibraryId: string | null;
  ezproxyPrefix: string | null;
  // profile
  name: string | null;
  speciality: string | null;
  country: string | null;
  city: string | null;
  avatarUrl: string | null;
  // social / privacy
  shareLibraryActivity: boolean;
  acceptPdfRequests: boolean;
  whatsappNumber: string | null;
  discoverable: boolean;
}

export async function getSettings(userId: string): Promise<InstitutionalSettings> {
  const res = await query<{
    libkey_library_id: string | null;
    ezproxy_prefix: string | null;
    name: string | null;
    speciality: string | null;
    country: string | null;
    city: string | null;
    avatar_url: string | null;
    share_library_activity: boolean;
    accept_pdf_requests: boolean;
    whatsapp_number: string | null;
    discoverable: boolean;
  }>(
    `SELECT libkey_library_id, ezproxy_prefix,
            name, speciality, country, city, avatar_url,
            share_library_activity, accept_pdf_requests, whatsapp_number, discoverable
       FROM users WHERE id = $1`,
    [userId],
  );
  const row = res.rows[0];
  return {
    libkeyLibraryId: row?.libkey_library_id ?? null,
    ezproxyPrefix: row?.ezproxy_prefix ?? null,
    name: row?.name ?? null,
    speciality: row?.speciality ?? null,
    country: row?.country ?? null,
    city: row?.city ?? null,
    avatarUrl: row?.avatar_url ?? null,
    shareLibraryActivity: row?.share_library_activity ?? false,
    acceptPdfRequests: row?.accept_pdf_requests ?? false,
    whatsappNumber: row?.whatsapp_number ?? null,
    discoverable: row?.discoverable ?? true,
  };
}

// GET /api/settings — profile + institutional access + social prefs
settingsRouter.get('/', async (req, res) => {
  res.json(await getSettings(req.userId!));
});

// PATCH /api/settings — partial update (empty string clears a text field)
settingsRouter.patch('/', async (req, res) => {
  const schema = z.object({
    libkeyLibraryId: z.string().max(120).nullable().optional(),
    ezproxyPrefix: z.string().max(300).nullable().optional(),
    name: z.string().max(120).nullable().optional(),
    speciality: z.string().max(120).nullable().optional(),
    country: z.string().max(2).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    avatarUrl: z.string().url().max(2000).nullable().optional(),
    shareLibraryActivity: z.boolean().optional(),
    acceptPdfRequests: z.boolean().optional(),
    whatsappNumber: z.string().max(40).nullable().optional(),
    discoverable: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const norm = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

  // Column map for the simple text/bool fields.
  const text: Record<string, string> = {
    libkeyLibraryId: 'libkey_library_id',
    ezproxyPrefix: 'ezproxy_prefix',
    name: 'name',
    speciality: 'speciality',
    country: 'country',
    city: 'city',
    whatsappNumber: 'whatsapp_number',
  };
  const bool: Record<string, string> = {
    shareLibraryActivity: 'share_library_activity',
    acceptPdfRequests: 'accept_pdf_requests',
    discoverable: 'discoverable',
  };

  const sets: string[] = [];
  const params: any[] = [];
  for (const [key, col] of Object.entries(text)) {
    if (key in parsed.data) {
      params.push(norm((parsed.data as any)[key]));
      sets.push(`${col} = $${params.length}`);
    }
  }
  for (const [key, col] of Object.entries(bool)) {
    if (key in parsed.data) {
      params.push((parsed.data as any)[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }

  // Avatar: when it changes, swap the URL and best-effort delete the old blob.
  if ('avatarUrl' in parsed.data) {
    const prev = await query<{ avatar_url: string | null }>(
      'SELECT avatar_url FROM users WHERE id = $1',
      [req.userId],
    );
    const newUrl = norm(parsed.data.avatarUrl);
    params.push(newUrl);
    sets.push(`avatar_url = $${params.length}`);
    const oldUrl = prev.rows[0]?.avatar_url ?? null;
    if (oldUrl && oldUrl !== newUrl && config.BLOB_READ_WRITE_TOKEN) {
      del(oldUrl, { token: config.BLOB_READ_WRITE_TOKEN }).catch((e) =>
        console.error('[settings] old avatar blob del failed:', e?.message ?? e),
      );
    }
  }

  if (sets.length === 0) return res.json(await getSettings(req.userId!));

  params.push(req.userId);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  res.json(await getSettings(req.userId!));
});
