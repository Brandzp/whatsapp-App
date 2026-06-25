import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from './config/index.js';
import { requireAuth } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.js';
import whatsappRoutes from './routes/whatsapp.js';
import redirectRoutes from './routes/redirect.js';
import legalRoutes from './routes/legal.js';
import flowsRoutes from './routes/flows.js';
import conversationRoutes from './routes/conversations.js';
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import linkRoutes from './routes/links.js';
import analyticsRoutes from './routes/analytics.js';
import uploadsRoutes, { uploadsDir } from './routes/uploads.js';

const app = express();

app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
if (config.env === 'development') app.use(morgan('dev'));

// Health — `commit` reflects the deployed build (Render sets RENDER_GIT_COMMIT),
// so GET /health confirms exactly which version is live.
app.get('/health', (req, res) =>
  res.json({
    ok: true,
    commit: (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7),
    openai: config.openai.enabled,
    whatsapp: config.whatsapp.enabled,
  })
);

// ── Public routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes); // /login public, /me self-guards
app.use('/api/whatsapp', whatsappRoutes); // webhook + simulator
app.use('/', redirectRoutes); // /r/:linkId click tracking
app.use('/', legalRoutes); // /privacy + /terms (required by Meta for app token)
app.use('/uploads', express.static(uploadsDir)); // public so WhatsApp can fetch sent audio by URL

// ── Protected admin routes (JWT) ─────────────────────────────
app.use('/api', requireAuth, flowsRoutes); // /api/flows*, /api/questions/:id
app.use('/api/conversations', requireAuth, conversationRoutes);
app.use('/api/knowledge-base', requireAuth, knowledgeBaseRoutes);
app.use('/api/links', requireAuth, linkRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);
app.use('/api/uploads', requireAuth, uploadsRoutes); // audio upload for question voice notes

// ── Serve the built admin frontend (single-service deploy) ───
// When frontend/dist exists, serve it and fall back to index.html for client-side
// routing. API/asset paths fall through to the 404 handler instead. Skipped in
// dev (no dist) where Vite serves the frontend separately on :5173.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
