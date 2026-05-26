// src/services/telemetry.service.js
// Mirrors Flutter's TelemetryRemoteDataSource + TelemetryLocalDataSource sync.
// Table: public.telemetry_logs
//
// TelemetryPayloadModel fields (snake_case in DB):
//   bike_id, battery_percentage, voltage_v, current_a, speed_kmh,
//   temperature_celsius, odometer, motor_rpm, status, timestamp

import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/v1/telemetry/history
 * Query: ?bikeId=<id>&limit=100
 * Flutter: TelemetryRemoteDataSource.getHistory(bikeId, limit)
 */
export const getTelemetryHistory = asyncHandler(async (req, res) => {
  const { bikeId } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

  if (!bikeId) {
    return res.status(422).json({ success: false, error: 'bikeId query param is required' });
  }

  const { data, error } = await req.supabase
    .from('telemetry_logs')
    .select('*')
    .eq('bike_id', bikeId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return res.json({ success: true, data });
});

/**
 * GET /api/v1/telemetry/latest
 * Query: ?bikeId=<id>
 * Returns the single most-recent telemetry snapshot — used by the dashboard.
 */
export const getLatestTelemetry = asyncHandler(async (req, res) => {
  const { bikeId } = req.query;

  if (!bikeId) {
    return res.status(422).json({ success: false, error: 'bikeId query param is required' });
  }

  const { data, error } = await req.supabase
    .from('telemetry_logs')
    .select('*')
    .eq('bike_id', bikeId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ success: false, error: 'No telemetry found for this bike' });
    }
    throw error;
  }

  return res.json({ success: true, data });
});

/**
 * POST /api/v1/telemetry
 * Body: single TelemetryPayloadModel (camelCase — converted to snake_case below)
 * Used when the IoT device pushes telemetry directly to this backend.
 */
export const ingestTelemetry = asyncHandler(async (req, res) => {
  const {
    bikeId,
    batteryPercentage,
    voltageV,
    currentA,
    speedKmh,
    temperatureCelsius,
    odometer,
    motorRpm,
    status,
    timestamp,
  } = req.body;

  const { data, error } = await req.supabase
    .from('telemetry_logs')
    .insert({
      bike_id:              bikeId,
      battery_percentage:   batteryPercentage,
      voltage_v:            voltageV,
      current_a:            currentA,
      speed_kmh:            speedKmh,
      temperature_celsius:  temperatureCelsius,
      odometer,
      motor_rpm:            motorRpm,
      status:               status ?? 'normal',
      timestamp:            timestamp ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return res.status(201).json({ success: true, data });
});

/**
 * POST /api/v1/telemetry/batch
 * Body: { snapshots: TelemetryPayloadModel[] }
 * Flutter: TelemetryLocalDataSource offline buffer flush — max 500 rows.
 */
export const batchIngest = asyncHandler(async (req, res) => {
  const { snapshots } = req.body;

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return res.status(422).json({ success: false, error: 'snapshots array is required' });
  }
  if (snapshots.length > 500) {
    return res.status(422).json({ success: false, error: 'Maximum 500 snapshots per batch' });
  }

  const rows = snapshots.map((s) => ({
    bike_id:              s.bikeId,
    battery_percentage:   s.batteryPercentage,
    voltage_v:            s.voltageV,
    current_a:            s.currentA,
    speed_kmh:            s.speedKmh,
    temperature_celsius:  s.temperatureCelsius,
    odometer:             s.odometer,
    motor_rpm:            s.motorRpm,
    status:               s.status ?? 'normal',
    timestamp:            s.timestamp ?? new Date().toISOString(),
  }));

  const { data, error } = await req.supabase
    .from('telemetry_logs')
    .insert(rows)
    .select('id, bike_id, timestamp');

  if (error) throw error;

  return res.status(201).json({ success: true, inserted: data.length, data });
});
