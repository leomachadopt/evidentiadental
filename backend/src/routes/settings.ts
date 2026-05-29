import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import { authRequired } from '../middleware/auth.js';

export const settingsRouter = Router();
settingsRouter.use(authRequired);

export interface InstitutionalSettings {
  libkeyLibraryId: string | null;
  ezproxyPrefix: string | null;
  shareLibraryActivity: boolean;
  acceptPdfRequests: boolean;
  whatsappNumber: string | null;
}

export async function getSettings(userId: string): Promise<InstitutionalSettings> {
  const res = await query<{
    libkey_library_id: string | null;
    ezproxy_prefix: string | null;
    share_library_activity: boolean;
    accept_pdf_requests: boolean;
    whatsapp_number: string | null;
  }>(
    `SELECT libkey_library_id, ezproxy_prefix,
            share_library_activity, accept_pdf_requests, whatsapp_number
       FROM users WHERE id = $1`,
    [userId],
  );
  const row = res.rows[0];
  return {
    libkeyLibraryId: row?.libkey_library_id ?? null,
    ezproxyPrefix: row?.ezproxy_prefix ?? null,
    shareLibraryActivity: row?.share_library_activity ?? false,
    acceptPdfRequests: row?.accept_pdf_requests ?? false,
    whatsappNumber: row?.whatsapp_number ?? null,
  };
}

// GET /api/settings — institutional access prefs
settingsRouter.get('/', async (req, res) => {
  res.json(await getSettings(req.userId!));
});

// PATCH /api/settings — update institutional access prefs (empty string clears)
settingsRouter.patch('/', async (req, res) => {
  const schema = z.object({
    libkeyLibraryId: z.string().max(120).nullable().optional(),
    ezproxyPrefix: z.string().max(300).nullable().optional(),
    shareLibraryActivity: z.boolean().optional(),
    acceptPdfRequests: z.boolean().optional(),
    whatsappNumber: z.string().max(40).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const norm = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

  const sets: string[] = [];
  const params: any[] = [];
  if ('libkeyLibraryId' in parsed.data) {
    params.push(norm(parsed.data.libkeyLibraryId));
    sets.push(`libkey_library_id = $${params.length}`);
  }
  if ('ezproxyPrefix' in parsed.data) {
    params.push(norm(parsed.data.ezproxyPrefix));
    sets.push(`ezproxy_prefix = $${params.length}`);
  }
  if ('shareLibraryActivity' in parsed.data) {
    params.push(parsed.data.shareLibraryActivity);
    sets.push(`share_library_activity = $${params.length}`);
  }
  if ('acceptPdfRequests' in parsed.data) {
    params.push(parsed.data.acceptPdfRequests);
    sets.push(`accept_pdf_requests = $${params.length}`);
  }
  if ('whatsappNumber' in parsed.data) {
    params.push(norm(parsed.data.whatsappNumber));
    sets.push(`whatsapp_number = $${params.length}`);
  }
  if (sets.length === 0) return res.json(await getSettings(req.userId!));

  params.push(req.userId);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  res.json(await getSettings(req.userId!));
});
