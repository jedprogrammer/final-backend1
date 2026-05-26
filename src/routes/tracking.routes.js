// src/routes/tracking.routes.js
import { Router } from 'express';
import { body, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as svc from '../services/tracking.service.js';

const router = Router();
router.use(authenticate);

router.get('/route',     [query('bikeId').notEmpty(), validate], svc.getRideRoute);
router.post('/location', [body('bikeId').notEmpty(), body('latitude').isFloat(), body('longitude').isFloat(), validate], svc.pushLocation);
router.post('/location/batch', svc.batchPushLocations);

export default router;
