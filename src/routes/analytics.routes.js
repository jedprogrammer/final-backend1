// src/routes/analytics.routes.js
import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as svc from '../services/analytics.service.js';

const router = Router();
router.use(authenticate);

router.get('/sessions',       svc.getRideSessions);
router.get('/sessions/:id',   [param('id').isUUID(), validate], svc.getRideSession);
router.get('/weekly',         svc.getWeeklyStats);
router.post('/sessions',      [body('bikeId').notEmpty(), body('startTime').notEmpty(), validate], svc.createRideSession);

export default router;
