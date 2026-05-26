// src/services/alerts.service.js
// Mirrors Flutter's AlertsRemoteDataSource.
// Table: public.alerts
//
// AlertModel fields (snake_case in DB):
//   id, bike_id, severity (info|warning|critical),
//   type (battery_low|overheat|geofence|tamper|fault),
//   title, message, is_read, is_resolved, created_at

import { asyncHandler } from '../middleware/errorHandler.js';

const VALID_SEVERITIES = ['info', 'warning', 'critical'];
const VALID_TYPES      = ['battery_low', 'overheat', 'geofence', 'tamper', 'fault'];

/**
 * GET /api/v1/alerts
 * Query: ?bikeId=<id>&unresolved=true&severity=critical
 * Flutter: AlertsRemoteDataSource.streamActiveAlerts(bikeId)
 * (Flutter streams via Supabase Realtime; this REST endpoint is the HTTP fallback)
 */
export const getAlerts = asyncHandler(async (req, res) => {
  const { bikeId } = req.query;

  if (!bikeId) {
    return res.status(422).json({ success: false, error: 'bikeId query param is required' });
  }

  let query = req.supabase
    .from('alerts')
    .select('*')
    .eq('bike_id', bikeId)
    .order('created_at', { ascending: false });

  // Default: only active (unresolved) alerts, matching Flutter's .where(!a.isResolved)
  if (req.query.unresolved !== 'false') {
    query = query.eq('is_resolved', false);
  }
  if (req.query.severity && VALID_SEVERITIES.includes(req.query.severity)) {
    query = query.eq('severity', req.query.severity);
  }

  const { data, error } = await query;
  if (error) throw error;

  return res.json({ success: true, data });
});

/**
 * PATCH /api/v1/alerts/:id/read
 * Flutter: AlertsRemoteDataSource.markAlertRead(alertId)
 */
export const markAlertRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await req.supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    throw error;
  }

  return res.json({ success: true, data });
});

/**
 * PATCH /api/v1/alerts/:id/resolve
 * Mark an alert as resolved (clears it from Flutter's active alert stream).
 */
export const resolveAlert = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await req.supabase
    .from('alerts')
    .update({ is_resolved: true, is_read: true })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    throw error;
  }

  return res.json({ success: true, data });
});

/**
 * POST /api/v1/alerts
 * Body: { bikeId, severity, type, title, message }
 * Used by IoT device / server-side logic to push new alerts.
 * Supabase Realtime will push the new row to all subscribed Flutter clients.
 */
export const createAlert = asyncHandler(async (req, res) => {
  const { bikeId, severity, type, title, message } = req.body;

  if (!VALID_SEVERITIES.includes(severity)) {
    return res.status(422).json({
      success: false,
      error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}`,
    });
  }
  if (!VALID_TYPES.includes(type)) {
    return res.status(422).json({
      success: false,
      error: `type must be one of: ${VALID_TYPES.join(', ')}`,
    });
  }

  const { data, error } = await req.supabase
    .from('alerts')
    .insert({
      bike_id:     bikeId,
      severity,
      type,
      title,
      message,
      is_read:     false,
      is_resolved: false,
      created_at:  new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return res.status(201).json({ success: true, data });
});

/**
 * DELETE /api/v1/alerts/:id
 */
export const deleteAlert = asyncHandler(async (req, res) => {
  const { error } = await req.supabase
    .from('alerts')
    .delete()
    .eq('id', req.params.id);

  if (error) throw error;

  return res.json({ success: true, message: 'Alert deleted' });
});
