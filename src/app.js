import express from 'express';
import path from 'node:path';
import { projectRoot } from './config.js';
import { openDatabase } from './db.js';
import { requireUser } from './auth.js';
import * as v from './validation.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { paintingRoutes } from './routes/paintings.js';
import { orderRoutes } from './routes/orders.js';
import { bookingRoutes } from './routes/bookings.js';
import { potteryRoutes } from './routes/pottery.js';

// This file connects the server, shared checks and feature routes.
// Each routes/ file shows its own validation -> SQL -> JSON response.
export function createApp(config) {
  const db = openDatabase(config.databasePath);
  const now = config.now || (() => new Date());

  // 1. Apply the same authentication, origin and JSON checks to every API route.
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    });
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    const publicRoute =
      (req.method === 'GET' && req.path === '/health') ||
      (req.method === 'POST' && ['/auth/signup', '/auth/login'].includes(req.path));
    if (publicRoute) return next();
    return requireUser(db, now)(req, res, next);
  });
  app.use('/api', (req, res, next) => {
    // JSON + same-origin requests prevent cross-site form submissions.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const expectedOrigin = config.appOrigin || `${req.protocol}://${req.get('host')}`;
      if (req.get('origin') && req.get('origin') !== expectedOrigin)
        v.fail(403, 'Use the app from its configured origin.');
      if (!req.is('application/json')) v.fail(415, 'Send application/json.');
    }
    next();
  });
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use('/api', (req, res, next) => {
    if (req.body !== undefined && (Array.isArray(req.body) || req.body === null))
      v.fail(400, 'Send a JSON object.');
    req.body ??= {};
    next();
  });

  // 2. Match an HTTP path to one clearly named feature file.
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes(db, config, now));
  app.use('/api/catalog', catalogRoutes(db, now));
  app.use('/api/paintings', paintingRoutes(db));
  app.use('/api/orders', orderRoutes(db, now));
  app.use('/api/bookings', bookingRoutes(db, now));
  app.use('/api/pottery', potteryRoutes(db, now));

  // 3. Serve the HTML/CSS files and turn failures into readable responses.
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use(express.static(path.join(projectRoot, 'public'), { dotfiles: 'deny' }));
  app.use((req, res) => res.status(404).send('Page not found.'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request is too large.' });
    if (error.status && error.status <= 503)
      return res.status(error.status).json({ error: error.message });
    if (error.code === 'ERR_SQLITE_ERROR' && /busy|locked/i.test(error.message)) {
      return res.status(503).json({ error: 'The studio is busy. Please try again.' });
    }
    if (!config.quiet) console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return { app, db };
}
