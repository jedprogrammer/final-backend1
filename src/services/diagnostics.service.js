// src/services/diagnostics.service.js
// Mirrors Flutter's DiagnosticsRemoteDataSource.
// Tables: public.diagnostics (+ nested fault_codes), public.maintenance_logs
//
// DiagnosticModel fields (snake_case in DB):
//   id, bike_id, health_score, last_diagnostic_at, maintenance_status
//   (fault_codes joined via FK: code, description, severity, detected_at, is_active)
//
// MaintenanceLogModel fields:
//   id, bike_id, description, performed_at, next_due_at, technician

import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/v1/diagnostics
 * Query: ?bikeId=<id>
 * Flutter: DiagnosticsRemoteDataSource.getDiagnostics(bikeId)
 * Returns the most-recent diagnostic record with nested fault_codes.
 */
export const getDiagnostics = asyncHandler(async (req, res) => {
  const { bikeId } = req.query;

  if (!bikeId) {
    return res.status(422).json({ success: false, error: 'bikeId query param is required' });
  }

  const { data, error } = await req.supabase
    .from('diagnostics')
    .select('*, fault_codes(*)')
    .eq('bike_id', bikeId)
    .order('last_diagnostic_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ success: false, error: 'No diagnostics found for this bike' });
    }
    throw error;
  }

  return res.json({ success: true, data });
});

/**
 * GET /api/v1/diagnostics/maintenance
 * Query: ?bikeId=<id>
 * Flutter: DiagnosticsRemoteDataSource.getMaintenanceLogs(bikeId)
 */
export const getMaintenanceLogs = asyncHandler(async (req, res) => {
  const { bikeId } = req.query;

  if (!bikeId) {
    return res.status(422).json({ success: false, error: 'bikeId query param is required' });
  }

  const { data, error } = await req.supabase
    .from('maintenance_logs')
    .select('*')
    .eq('bike_id', bikeId)
    .order('performed_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return res.json({ success: true, data });
});

/**
 * POST /api/v1/diagnostics
 * Body: { bikeId, healthScore, maintenanceStatus, faultCodes[] }
 * Used by IoT device to push a new diagnostic snapshot.
 * Inserts a diagnostics row then bulk-inserts fault_codes.
 */
export const createDiagnostic = asyncHandler(async (req, res) => {
  const { bikeId, healthScore, maintenanceStatus, faultCodes = [] } = req.body;

  // Insert the parent diagnostic record
  const { data: diagnostic, error: diagError } = await req.supabase
    .from('diagnostics')
    .insert({
      bike_id:             bikeId,
      health_score:        healthScore,
      maintenance_status:  maintenanceStatus ?? 'ok',
      last_diagnostic_at:  new Date().toISOString(),
    })
    .select()
    .single();

  if (diagError) throw diagError;

  // Insert associated fault codes
  if (faultCodes.length > 0) {
    const fcRows = faultCodes.map((fc) => ({
      diagnostic_id: diagnostic.id,
      bike_id:       bikeId,
      code:          fc.code,
      description:   fc.description,
      severity:      fc.severity ?? 'minor',
      detected_at:   fc.detectedAt ?? new Date().toISOString(),
      is_active:     fc.isActive ?? true,
    }));

    const { error: fcError } = await req.supabase
      .from('fault_codes')
      .insert(fcRows);

    if (fcError) throw fcError;
  }

  // Return the full record with fault codes
  const { data: full, error: fullError } = await req.supabase
    .from('diagnostics')
    .select('*, fault_codes(*)')
    .eq('id', diagnostic.id)
    .single();

  if (fullError) throw fullError;

  return res.status(201).json({ success: true, data: full });
});

/**
 * POST /api/v1/diagnostics/maintenance
 * Body: { bikeId, description, performedAt, nextDueAt?, technician? }
 */
export const createMaintenanceLog = asyncHandler(async (req, res) => {
  const { bikeId, description, performedAt, nextDueAt, technician } = req.body;

  const { data, error } = await req.supabase
    .from('maintenance_logs')
    .insert({
      bike_id:      bikeId,
      description,
      performed_at: performedAt ?? new Date().toISOString(),
      next_due_at:  nextDueAt ?? null,
      technician:   technician ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  return res.status(201).json({ success: true, data });
});
