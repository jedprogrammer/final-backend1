// src/routes/telemetry.routes.js
import { Router } from 'express';
import { body, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as svc from '../services/telemetry.service.js';

const router = Router();
router.use(authenticate);

router.get(
  '/history',
  [query('bikeId').notEmpty(), validate],
  svc.getTelemetryHistory
);

router.get(
  '/latest',
  [query('bikeId').notEmpty(), validate],
  svc.getLatestTelemetry
);

router.post(
  '/',
  [body('bikeId').notEmpty(), body('batteryPercentage').isFloat(), validate],
  svc.ingestTelemetry
);

router.post('/batch', svc.batchIngest);

export default router;
