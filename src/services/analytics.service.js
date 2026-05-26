// src/services/analytics.service.js
// Mirrors Flutter's AnalyticsRemoteDataSource.
// Table: public.ride_sessions
//
// RideSessionModel fields (snake_case in DB):
//   id, rider_id, bike_id, start_time, end_time,
//   distance_km, avg_speed_kmh, max_speed_kmh,
//   energy_consumed_kwh, avg_battery_drain

import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/v1/analytics/sessions
 * Query: ?riderId=<id>  (defaults to authenticated rider)
 * Flutter: AnalyticsRemoteDataSource.getRideSessions(riderId)
 */
export const getRideSessions = asyncHandler(async (req, res) => {
  const riderId = req.query.riderId ?? req.user.id;

  const { data, error } = await req.supabase
    .from('ride_sessions')
    .select('*')
    .eq('rider_id', riderId)
    .order('start_time', { ascending: false })
    .limit(50);

  if (error) throw error;

  return res.json({ success: true, data });
});

/**
 * GET /api/v1/analytics/sessions/:id
 * Single session detail.
 */
export const getRideSession = asyncHandler(async (req, res) => {
  const { data, error } = await req.supabase
    .from('ride_sessions')
    .select('*')
    .eq('id', req.params.id)
    .eq('rider_id', req.user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    throw error;
  }

  return res.json({ success: true, data });
});

/**
 * GET /api/v1/analytics/weekly
 * Query: ?bikeId=<id>
 * Flutter: GetWeeklyStatsUseCase — aggregate stats for the past 7 days.
 */
export const getWeeklyStats = asyncHandler(async (req, res) => {
  const riderId = req.user.id;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await req.supabase
    .from('ride_sessions')
    .select('distance_km, avg_speed_kmh, max_speed_kmh, energy_consumed_kwh, start_time')
    .eq('rider_id', riderId)
    .gte('start_time', sevenDaysAgo);

  if (error) throw error;

  // Aggregate in JS (avoids a custom Postgres function)
  const stats = data.reduce(
    (acc, s) => {
      acc.totalDistanceKm      += s.distance_km ?? 0;
      acc.totalEnergyKwh       += s.energy_consumed_kwh ?? 0;
      acc.maxSpeedKmh           = Math.max(acc.maxSpeedKmh, s.max_speed_kmh ?? 0);
      acc.totalSessions         += 1;
      acc._avgSpeedSum          += s.avg_speed_kmh ?? 0;
      return acc;
    },
    { totalDistanceKm: 0, totalEnergyKwh: 0, maxSpeedKmh: 0, totalSessions: 0, _avgSpeedSum: 0 }
  );

  const avgSpeedKmh = stats.totalSessions > 0
    ? +(stats._avgSpeedSum / stats.totalSessions).toFixed(2)
    : 0;

  delete stats._avgSpeedSum;

  return res.json({
    success: true,
    data: {
      ...stats,
      totalDistanceKm: +stats.totalDistanceKm.toFixed(2),
      totalEnergyKwh:  +stats.totalEnergyKwh.toFixed(3),
      avgSpeedKmh,
    },
  });
});

/**
 * POST /api/v1/analytics/sessions
 * Body: RideSessionModel (camelCase)
 * Called when a ride ends to persist the session summary.
 */
export const createRideSession = asyncHandler(async (req, res) => {
  const {
    bikeId,
    startTime,
    endTime,
    distanceKm,
    avgSpeedKmh,
    maxSpeedKmh,
    energyConsumedKwh,
    avgBatteryDrain,
  } = req.body;

  const { data, error } = await req.supabase
    .from('ride_sessions')
    .insert({
      rider_id:            req.user.id,
      bike_id:             bikeId,
      start_time:          startTime,
      end_time:            endTime ?? null,
      distance_km:         distanceKm ?? 0,
      avg_speed_kmh:       avgSpeedKmh ?? 0,
      max_speed_kmh:       maxSpeedKmh ?? 0,
      energy_consumed_kwh: energyConsumedKwh ?? 0,
      avg_battery_drain:   avgBatteryDrain ?? 0,
    })
    .select()
    .single();

  if (error) throw error;

  return res.status(201).json({ success: true, data });
});
