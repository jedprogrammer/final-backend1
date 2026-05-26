// src/routes/auth.routes.js
import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as svc from '../services/auth.service.js';

const router = Router();

router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty(), validate],
  svc.login
);

router.post(
  '/signup',
  [
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('fullName').trim().notEmpty(),
    body('phoneNumber').trim().notEmpty(),
    validate,
  ],
  svc.signup
);

router.post('/logout', authenticate, svc.logout);

router.post(
  '/forgot-password',
  [body('email').isEmail(), validate],
  svc.forgotPassword
);

router.get('/me', authenticate, svc.getMe);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty(), validate],
  svc.refreshToken
);

export default router;
