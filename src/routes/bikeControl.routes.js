// src/routes/bikeControl.routes.js
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as svc from '../services/bikeControl.service.js';

const router = Router();
router.use(authenticate);

router.post('/command',         [body('bikeId').notEmpty(), body('type').notEmpty(), validate], svc.sendCommand);
router.get('/commands',         [query('bikeId').notEmpty(), validate], svc.getCommandHistory);
router.patch('/commands/:id/status', [param('id').isUUID(), body('status').notEmpty(), validate], svc.updateCommandStatus);

export default router;
