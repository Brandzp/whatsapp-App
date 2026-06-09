import { Router } from 'express';
import config from '../config/index.js';
import { asyncHandler } from '../middleware/error.js';
import { parseIncomingMessage } from '../services/whatsapp.js';
import { handleIncomingMessage } from '../services/conversationEngine.js';

const router = Router();

// Meta webhook verification handshake
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Inbound messages from WhatsApp Cloud API
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    // Acknowledge fast; process inline (small scale). For high volume, queue this.
    const parsed = parseIncomingMessage(req.body);
    res.sendStatus(200);
    if (!parsed || !parsed.text) return;
    try {
      await handleIncomingMessage({
        phone: parsed.phone,
        text: parsed.text,
        name: parsed.name,
        rawPayload: parsed.raw,
      });
    } catch (err) {
      console.error('[webhook] processing error:', err);
    }
  })
);

// Local simulator: drive the full pipeline without Meta. Returns the structured agent response.
router.post(
  '/simulate',
  asyncHandler(async (req, res) => {
    const { phone, text, name } = req.body || {};
    if (!phone || !text) return res.status(400).json({ error: 'phone and text are required' });
    const result = await handleIncomingMessage({ phone, text, name });
    res.json(result);
  })
);

export default router;
