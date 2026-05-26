// src/services/profile.service.js
// Mirrors Flutter's ProfileRemoteDataSource.
// Tables: public.riders, public.bikes
//
// BikeModel fields (snake_case in DB):
//   id, serial_number, model, registration_number,
//   battery_capacity_kwh, last_service_date, status
//
// RiderModel fields:
//   id, email, full_name, phone_number, avatar_url,
//   assigned_bike_id, created_at, is_active

import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/v1/profile/bike
 * Query: ?bikeId=<uuid>
 * Flutter: ProfileRemoteDataSource.getBike(bikeId)
 * Returns the bike assigned to the authenticated rider.
 */
export const getAssignedBike = asyncHandler(async (req, res) => {
  // Allow explicit bikeId query param, otherwise use the rider's assigned bike
  const bikeId = req.query.bikeId;

  if (!bikeId) {
    // Look up rider's assigned_bike_id first
    const { data: rider, error: riderError } = await req.supabase
      .from('riders')
      .select('assigned_bike_id')
      .eq('id', req.user.id)
      .single();

    if (riderError) throw riderError;

    if (!rider.assigned_bike_id) {
      return res.status(404).json({ success: false, error: 'No bike assigned to this rider' });
    }

    const { data: bike, error: bikeError } = await req.supabase
      .from('bikes')
      .select('*')
      .eq('id', rider.assigned_bike_id)
      .single();

    if (bikeError) {
      if (bikeError.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Assigned bike not found' });
      }
      throw bikeError;
    }

    return res.json({ success: true, data: bike });
  }

  const { data, error } = await req.supabase
    .from('bikes')
    .select('*')
    .eq('id', bikeId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ success: false, error: 'Bike not found' });
    }
    throw error;
  }

  return res.json({ success: true, data });
});

/**
 * PATCH /api/v1/profile
 * Body: any subset of { fullName, phoneNumber, avatarUrl }
 * Flutter: ProfileRemoteDataSource.updateRider(data, riderId)
 */
export const updateRiderProfile = asyncHandler(async (req, res) => {
  const { fullName, phoneNumber, avatarUrl } = req.body;

  const updates = {};
  if (fullName !== undefined)   updates.full_name    = fullName;
  if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
  if (avatarUrl !== undefined)  updates.avatar_url   = avatarUrl;

  if (Object.keys(updates).length === 0) {
    return res.status(422).json({ success: false, error: 'No valid fields provided' });
  }

  const { data, error } = await req.supabase
    .from('riders')
    .update(updates)
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) throw error;

  return res.json({ success: true, data });
});
