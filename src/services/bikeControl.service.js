// src/services/bikeControl.service.js
// Mirrors Flutter's BikeControlDataSource.
// Table: public.bike_commands  (audit log)
// Primary delivery: MQTT (handled by IoT layer); this backend logs the command
// and can relay it if a server-side MQTT broker is used.
//
// BikeCommandModel fields (snake_case in DB):
//   bike_id, type, payload, issued_at, status
//
// CommandType values: lock | unlock | disable | enable | honk | lights_on | lights_off
// CommandStatus values: pending | sent | acknowledged | failed

import { asyncHandler } from '../middleware/errorHandler.js';

const VALID_COMMAND_TYPES = [
  'lock', 'unlock', 'disable', 'enable', 'honk', 'lights_on', 'lights_off',
];
const VALID_STATUSES = ['pending', 'sent', 'acknowledged', 'failed'];

/**
 * POST /api/v1/bike-control/command
 * Body: { bikeId, type, payload? }
 * Flutter: BikeControlDataSource.sendCommand(bikeId, type, payload)
 *
 * Logs the command to Supabase (audit trail) and returns the record.
 * MQTT publishing happens client-side via MqttService; this backend
 * records the intent so admins can track command history.
 */
export const sendCommand = asyncHandler(async (req, res) => {
  const { bikeId, type, payload } = req.body;

  if (!bikeId) {
    return res.status(422).json({ success: false, error: 'bikeId is required' });
  }
  if (!VALID_COMMAND_TYPES.includes(type)) {
    return res.status(422).json({
      success: false,
      error: `type must be one of: ${VALID_COMMAND_TYPES.join(', ')}`,
    });
  }

  const issuedAt = new Date().toISOString();

  const { data, error } = await req.supabase
    .from('bike_commands')
    .insert({
      bike_id:   bikeId,
      type,
      payload:   payload ?? null,
      issued_at: issuedAt,
      status:    'sent',
      rider_id:  req.user.id,
    })
    .select()
    .single();

  if (error) throw error;

  return res.status(201).json({ success: true, data });
});

/**
 * GET /api/v1/bike-control/commands
 * Query: ?bikeId=<id>&limit=20
 * Returns command history for a bike — useful for the security audit screen.
 */
export const getCommandHistory = asyncHandler(async (req, res) => {
  const { bikeId } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  if (!bikeId) {
    return res.status(422).json({ success: false, error: 'bikeId query param is required' });
  }

  const { data, error } = await req.supabase
    .from('bike_commands')
    .select('*')
    .eq('bike_id', bikeId)
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return res.json({ success: true, data });
});

/**
 * PATCH /api/v1/bike-control/commands/:id/status
 * Body: { status: 'acknowledged' | 'failed' }
 * Called by the IoT device (or MQTT broker webhook) to update command status.
 */
export const updateCommandStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(422).json({
      success: false,
      error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  const { data, error } = await req.supabase
    .from('bike_commands')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ success: false, error: 'Command not found' });
    }
    throw error;
  }

  return res.json({ success: true, data });
});
