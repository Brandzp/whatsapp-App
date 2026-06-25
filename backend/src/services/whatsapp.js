import config from '../config/index.js';

/**
 * Send a plain text message through the WhatsApp Business Cloud API.
 * If credentials are not configured, logs and resolves (local simulator mode).
 */
export async function sendWhatsAppMessage(toPhone, text) {
  if (!config.whatsapp.enabled) {
    console.log(`[whatsapp:simulated] → ${toPhone}: ${text}`);
    return { simulated: true };
  }

  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'text',
    text: { preview_url: true, body: text },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[whatsapp] send failed', res.status, errText);
    throw new Error(`WhatsApp send failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Send a pre-recorded voice note / audio message through the Cloud API.
 * `link` must be a publicly reachable HTTPS URL to the audio file. For it to
 * render as a WhatsApp voice note (waveform bubble) the file should be .ogg /
 * Opus; other audio formats are delivered as a playable audio attachment.
 * In simulator mode (no credentials) this just logs.
 */
export async function sendWhatsAppAudio(toPhone, link) {
  if (!link) return { skipped: true };
  if (!config.whatsapp.enabled) {
    console.log(`[whatsapp:simulated] → ${toPhone}: [audio] ${link}`);
    return { simulated: true };
  }

  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'audio',
    audio: { link },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[whatsapp] audio send failed', res.status, errText);
    throw new Error(`WhatsApp audio send failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Send an image message through the Cloud API. `link` must be a publicly
 * reachable HTTPS URL to the image (jpg/png). Optional caption. In simulator
 * mode (no credentials) this just logs.
 */
export async function sendWhatsAppImage(toPhone, link, caption) {
  if (!link) return { skipped: true };
  if (!config.whatsapp.enabled) {
    console.log(`[whatsapp:simulated] → ${toPhone}: [image] ${link}`);
    return { simulated: true };
  }

  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'image',
    image: { link, ...(caption ? { caption } : {}) },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[whatsapp] image send failed', res.status, errText);
    throw new Error(`WhatsApp image send failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Extract the first inbound text message from a WhatsApp webhook payload.
 * Returns { phone, text, name, waMessageId, raw } or null if not a user message.
 */
export function parseIncomingMessage(payload) {
  try {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return null;

    const phone = message.from;
    const contact = value?.contacts?.[0];
    const name = contact?.profile?.name || null;

    let text = '';
    if (message.type === 'text') text = message.text?.body || '';
    else if (message.type === 'button') text = message.button?.text || '';
    else if (message.type === 'interactive') {
      text =
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        '';
    } else {
      text = `[${message.type}]`;
    }

    return { phone, text, name, waMessageId: message.id, raw: message };
  } catch (err) {
    console.error('[whatsapp] parse error', err.message);
    return null;
  }
}
