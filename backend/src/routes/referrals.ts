import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { getMyCircle } from '../services/referral-service.js';

export const referralsRouter = Router();
referralsRouter.use(authRequired);

// GET /api/referrals/me — código, link e estado do círculo de indicações.
referralsRouter.get('/me', async (req, res) => {
  const status = await getMyCircle(req.userId!);
  res.json(status);
});
