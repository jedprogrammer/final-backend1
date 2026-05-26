// src/routes/diagnostics.routes.js
import { Router } from 'express';
import { body, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as svc from '../services/diagnostics.service.js';

const router = Router();
router.use(authenticate);

router.get('/',           [query('bikeId').notEmpty(), validate], svc.getDiagnostics);
router.get('/maintenance',[query('bikeId').notEmpty(), validate], svc.getMaintenanceLogs);
router.post('/',          [body('bikeId').notEmpty(), body('healthScore').isInt(), validate], svc.createDiagnostic);
router.post('/maintenance',[body('bikeId').notEmpty(), body('description').notEmpty(), validate], svc.createMaintenanceLog);

export default router;
