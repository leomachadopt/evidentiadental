import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userTier?: string;
    }
  }
}

export interface JwtPayload {
  userId: string;
  tier: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '30d' });
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.userId = payload.userId;
    req.userTier = payload.tier;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
