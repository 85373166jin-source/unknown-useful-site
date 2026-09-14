import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth } from '../middleware/auth';
import { getMySubsite, joinFreeSubsite } from '../services/subsites';

export const subsitesRoutes = new Hono<AppEnv>();
subsitesRoutes.get('/me', bearerAuth, async (c) => c.json({ subsite: await getMySubsite(c.env, c.get('userId')) }));
subsitesRoutes.post('/join-free', bearerAuth, async (c) => c.json({ subsite: await joinFreeSubsite(c.env, c.get('userId')) }, 201));
