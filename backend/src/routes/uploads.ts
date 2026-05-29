/**
 * Vercel Blob client-upload token endpoint.
 *
 * Mounted OUTSIDE the auth'd library router (in index.ts) because the
 * @vercel/blob client `upload()` calls this URL itself and does not forward our
 * Authorization header — so the user's JWT is passed as `clientPayload` and
 * verified here. The browser uploads the PDF straight to Blob (no 4.5MB
 * serverless body limit); persistence happens when the client confirms via
 * POST /api/library/:id/pdf.
 */

import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { config } from '../lib/config.js';

export async function handleBlobUpload(req: Request, res: Response) {
  if (!config.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Upload de PDF não configurado (Vercel Blob em falta).' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!clientPayload) throw new Error('Não autenticado');
        const payload = jwt.verify(clientPayload, config.JWT_SECRET) as { userId: string };
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 30 * 1024 * 1024, // 30 MB
          tokenPayload: JSON.stringify({ userId: payload.userId }),
        };
      },
      // Persistence is done by the client confirming via POST /api/library/:id/pdf,
      // so this callback (which Vercel can't reach on localhost) is a no-op.
      onUploadCompleted: async () => {},
    });
    return res.json(jsonResponse);
  } catch (e: any) {
    console.error('[blob-upload]', e?.message ?? e);
    return res.status(400).json({ error: e?.message ?? 'Erro no upload' });
  }
}
