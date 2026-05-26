// src/middleware/auth.js
// Validates the Supabase JWT that Flutter's _AuthInterceptor attaches as
// "Authorization: Bearer <token>". On success:
//   - req.user  → decoded JWT payload (sub = rider's UUID)
//   - req.supabase → per-request client that runs inside the rider's RLS context

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase.js';
import ws from "ws"

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  // Use Supabase's own token verification so we stay in sync with their
  // auth system — no need to manage a separate JWT secret.
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  req.user = user;

  // Build a per-request Supabase client that carries the user's token
  // so every query runs inside that rider's Row-Level Security context.
  req.supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );

  next();
};
