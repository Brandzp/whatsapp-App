import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
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

// Health
app.get('/health', (req, res) =>
  res.json({ ok: true, openai: config.openai.enabled, whatsapp: config.whatsapp.enabled })
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

app.use(notFound);
app.use(errorHandler);

export default app;
