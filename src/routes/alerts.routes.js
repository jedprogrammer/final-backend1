// src/routes/alerts.routes.js
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as svc from '../services/alerts.service.js';

const router = Router();
router.use(authenticate);

router.get('/', [query('bikeId').notEmpty(), validate], svc.getAlerts);
router.post('/', [body('bikeId').notEmpty(), body('severity').notEmpty(), body('type').notEmpty(), body('title').notEmpty(), validate], svc.createAlert);
router.patch('/:id/read',    [param('id').isUUID(), validate], svc.markAlertRead);
router.patch('/:id/resolve', [param('id').isUUID(), validate], svc.resolveAlert);
router.delete('/:id',        [param('id').isUUID(), validate], svc.deleteAlert);

export default router;
