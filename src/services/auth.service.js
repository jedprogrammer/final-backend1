// src/services/auth.service.js
// Mirrors Flutter's AuthRemoteDataSource + AuthRepositoryImpl.
// Tables: auth.users (Supabase managed), public.riders (app profile)
//
// Rider model fields (snake_case in DB):
//   id, email, full_name, phone_number, avatar_url,
//   assigned_bike_id, created_at, is_active

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const fetchRiderProfile = async (supabase, userId) => {
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
};

// ── Handlers ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 * Flutter: AuthRemoteDataSource.login()
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ success: false, error: error.message });
  }

  const rider = await fetchRiderProfile(supabaseAdmin, data.user.id);

  return res.json({
    success: true,
    data: {
      rider,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    },
  });
});

/**
 * POST /api/v1/auth/signup
 * Body: { email, password, fullName, phoneNumber }
 * Flutter: AuthRemoteDataSource.signup()
 */
export const signup = asyncHandler(async (req, res) => {
  const { email, password, fullName, phoneNumber } = req.body;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone_number: phoneNumber },
  });

  if (error) {
    const status = error.message.includes('already') ? 409 : 400;
    return res.status(status).json({ success: false, error: error.message });
  }

  // Upsert rider profile row (mirrors Flutter's upsert after signUp)
  const { error: upsertError } = await supabaseAdmin.from('riders').upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    phone_number: phoneNumber,
    is_active: true,
    created_at: new Date().toISOString(),
  });

  if (upsertError) throw upsertError;

  // Sign in to get a session token for the new user
  const { data: sessionData, error: signInError } =
    await supabaseAdmin.auth.signInWithPassword({ email, password });

  if (signInError) throw signInError;

  const rider = await fetchRiderProfile(supabaseAdmin, data.user.id);

  return res.status(201).json({
    success: true,
    data: {
      rider,
      session: {
        accessToken: sessionData.session.access_token,
        refreshToken: sessionData.session.refresh_token,
        expiresAt: sessionData.session.expires_at,
      },
    },
  });
});

/**
 * POST /api/v1/auth/logout
 * Flutter: AuthRemoteDataSource.logout()
 * Supabase JWTs are stateless; this is a courtesy endpoint — the Flutter app
 * also calls supabase.auth.signOut() client-side.
 */
export const logout = asyncHandler(async (req, res) => {
  // Revoke the user's session on the Supabase side
  await supabaseAdmin.auth.admin.signOut(req.user.id);
  return res.json({ success: true, message: 'Logged out' });
});

/**
 * POST /api/v1/auth/forgot-password
 * Body: { email }
 * Flutter: AuthRemoteDataSource.forgotPassword()
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email);
  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  return res.json({ success: true, message: 'Password reset email sent' });
});

/**
 * GET /api/v1/auth/me
 * Flutter: AuthRemoteDataSource.getCurrentRider()
 * Uses the RLS-scoped req.supabase so the rider only sees their own row.
 */
export const getMe = asyncHandler(async (req, res) => {
  const rider = await fetchRiderProfile(req.supabase, req.user.id);
  return res.json({ success: true, data: rider });
});

/**
 * POST /api/v1/auth/refresh
 * Body: { refreshToken }
 * Called when Flutter detects an expired access token.
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return res.status(422).json({ success: false, error: 'refreshToken is required' });
  }

  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: token });

  if (error) {
    return res.status(401).json({ success: false, error: error.message });
  }

  return res.json({
    success: true,
    data: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
  });
});
