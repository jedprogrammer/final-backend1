// src/app.js
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import logger from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes        from './routes/auth.routes.js';
import profileRoutes     from './routes/profile.routes.js';
import telemetryRoutes   from './routes/telemetry.routes.js';
import alertsRoutes      from './routes/alerts.routes.js';
import diagnosticsRoutes from './routes/diagnostics.routes.js';
import trackingRoutes    from './routes/tracking.routes.js';
import analyticsRoutes   from './routes/analytics.routes.js';
import bikeControlRoutes from './routes/bikeControl.routes.js';

const app = express();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────────────────────
// Flutter mobile sends no Origin header, so we whitelist the absence too.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ── HTTP logging ─────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
}));

// Stricter limit on batch ingest endpoints
const batchLimiter = rateLimit({ windowMs: 60_000, max: 30 });
app.use('/api/v1/telemetry/batch', batchLimiter);
app.use('/api/v1/tracking/location/batch', batchLimiter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',         authRoutes);
app.use('/api/v1/profile',      profileRoutes);
app.use('/api/v1/telemetry',    telemetryRoutes);
app.use('/api/v1/alerts',       alertsRoutes);
app.use('/api/v1/diagnostics',  diagnosticsRoutes);
app.use('/api/v1/tracking',     trackingRoutes);
app.use('/api/v1/analytics',    analyticsRoutes);
app.use('/api/v1/bike-control', bikeControlRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;








