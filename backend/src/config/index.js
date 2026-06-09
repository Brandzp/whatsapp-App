import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  env: process.env.NODE_ENV || 'development',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    enabled: Boolean(process.env.OPENAI_API_KEY),
  },

  legal: {
    appName: process.env.LEGAL_APP_NAME || 'WhatsApp Business AI Agent',
    companyName: process.env.LEGAL_COMPANY_NAME || 'Your Company',
    contactEmail: process.env.LEGAL_CONTACT_EMAIL || 'support@example.com',
    websiteUrl: process.env.LEGAL_WEBSITE_URL || '',
    effectiveDate: process.env.LEGAL_EFFECTIVE_DATE || '2026-06-09',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'voice-notes',
    // When configured, uploads go to Supabase Storage (persists across Render
    // deploys). Otherwise uploads fall back to local disk (dev convenience).
    enabled: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  },

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'my-verify-token',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    enabled: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  },
};

export default config;
