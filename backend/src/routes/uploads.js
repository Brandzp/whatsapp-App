import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import config from '../config/index.js';
import { supabase } from '../lib/supabase.js';

// Local-disk fallback dir, served publicly at /uploads/* (see app.js). Used only
// when Supabase Storage isn't configured (e.g. local dev without a service key).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // WhatsApp audio cap is 16 MB
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
  },
});

const router = Router();

// POST /api/uploads/audio  (multipart, field name "file") → { url, filename }
router.post('/audio', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = (path.extname(req.file.originalname || '').toLowerCase() || '.ogg').replace(/[^.a-z0-9]/g, '');
    const filename = `voice-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

    if (supabase) {
      // Persistent storage — survives Render redeploys.
      const { error } = await supabase.storage
        .from(config.supabase.storageBucket)
        .upload(filename, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(config.supabase.storageBucket).getPublicUrl(filename);
      return res.status(201).json({ url: data.publicUrl, filename });
    }

    // Fallback: local disk (ephemeral on Render — fine for local dev).
    fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
    return res.status(201).json({ url: `${config.publicBaseUrl}/uploads/${filename}`, filename });
  } catch (err) {
    next(err);
  }
});

export default router;
