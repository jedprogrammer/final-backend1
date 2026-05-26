// src/services/tracking.service.js
// Mirrors Flutter's TrackingRemoteDataSource.
// Table: public.ride_locations
//
// LocationPayloadModel fields (snake_case in DB):
//   bike_id, latitude, longitude, heading_degrees,
//   speed_kmh, accuracy_m, timestamp

import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/v1/tracking/route
 * Query: ?bikeId=<id>&since=<ISO8601>
 * Flutter: TrackingRemoteDataSource.getRideRoute(bikeId, since)
 * Max 500 points, ordered oldest→newest for polyline drawing.
 */
export const getRideRoute = asyncHandler(async (req, res) => {
  const { bikeId, since } = req.query;

  if (!bikeId) {
    return res.status(422).json({ success: false, error: 'bikeId query param is required' });
  }

  let query = req.supabase
    .from('ride_locations')
    .select('*')
    .eq('bike_id', bikeId)
    .order('timestamp', { ascending: true })
    .limit(500);

  if (since) {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return res.status(422).json({ success: false, error: 'since must be a valid ISO 8601 date' });
    }
    query = query.gte('timestamp', sinceDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;

  return res.json({ success: true, data });
});

/**
 * POST /api/v1/tracking/location
 * Body: LocationPayloadModel (camelCase)
 * Pushed by the IoT device; triggers Supabase Realtime for Flutter's
 * StreamLiveLocationUseCase.
 */
export const pushLocation = asyncHandler(async (req, res) => {
  const {
    bikeId,
    latitude,
    longitude,
    headingDegrees,
    speedKmh,
    accuracyM,
    timestamp,
  } = req.body;

  const { data, error } = await req.supabase
    .from('ride_locations')
    .insert({
      bike_id:          bikeId,
      latitude,
      longitude,
      heading_degrees:  headingDegrees ?? 0,
      speed_kmh:        speedKmh ?? 0,
      accuracy_m:       accuracyM ?? 0,
      timestamp:        timestamp ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return res.status(201).json({ success: true, data });
});

/**
 * POST /api/v1/tracking/location/batch
 * Body: { locations: LocationPayloadModel[] }
 * Flush buffered offline GPS points.
 */
export const batchPushLocations = asyncHandler(async (req, res) => {
  const { locations } = req.body;

  if (!Array.isArray(locations) || locations.length === 0) {
    return res.status(422).json({ success: false, error: 'locations array is required' });
  }
  if (locations.length > 500) {
    return res.status(422).json({ success: false, error: 'Maximum 500 locations per batch' });
  }

  const rows = locations.map((l) => ({
    bike_id:         l.bikeId,
    latitude:        l.latitude,
    longitude:       l.longitude,
    heading_degrees: l.headingDegrees ?? 0,
    speed_kmh:       l.speedKmh ?? 0,
    accuracy_m:      l.accuracyM ?? 0,
    timestamp:       l.timestamp ?? new Date().toISOString(),
  }));

  const { data, error } = await req.supabase
    .from('ride_locations')
    .insert(rows)
    .select('id, bike_id, timestamp');

  if (error) throw error;

  return res.status(201).json({ success: true, inserted: data.length, data });
});
