// src/routes/profile.routes.js
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as svc from '../services/profile.service.js';

const router = Router();
router.use(authenticate);

router.get('/bike', svc.getAssignedBike);
router.patch('/', svc.updateRiderProfile);

export default router;
